import { mergeProject } from '../public/modules/session/merge.js';
import { validateProject } from '../public/modules/session/validation.js';
const fail = (message, status = 400, extra = {}) => { throw Object.assign(Error(message), { status, ...extra }); };
const digest = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(value))))).map(v => v.toString(16).padStart(2, '0')).join('');
export async function commitProject(db, id, actor, name, input, { restoredIds = [], resolvedProposalId = null, resolutionHash = null } = {}) {
    const { project, baseRevision, operationId } = input;
    if (!Number.isInteger(baseRevision) || baseRevision < 1 || typeof operationId !== 'string' || !/^[\w-]{8,100}$/.test(operationId))
        fail('A base revision and operation id are required.');
    validateProject(project);
    const requestHash = await digest(input), existing = await db.prepare('SELECT * FROM operations WHERE project_id=? AND operation_id=?').bind(id, operationId).first();
    if (existing) {
        if (existing.request_hash !== requestHash || existing.actor !== actor)
            fail('Operation id reused with different content.', 409);
        const response = JSON.parse(existing.response);
        if (response.error)
            fail(response.error, 409, response);
        return response;
    }
    const base = await db.prepare('SELECT document FROM versions WHERE project_id=? AND revision=?').bind(id, baseRevision).first();
    if (!base)
        fail('The base version is no longer retained. Save a project copy.', 409, { code: 'BASE_EXPIRED' });
    for (let attempt = 0; attempt < 4; attempt++) {
        const head = await db.prepare('SELECT * FROM projects WHERE id=?').bind(id).first();
        if (!head || head.archived)
            fail('Project is archived.', 403);
        if (baseRevision > head.revision)
            fail('Invalid base revision.');
        const tombstones = (await db.prepare('SELECT entity_type,entity_id FROM entity_tombstones WHERE project_id=?').bind(id).all()).results;
        const merge = mergeProject(JSON.parse(base.document), project, JSON.parse(head.document), { tombstones: tombstones.filter(t => !restoredIds.includes(t.entity_type + ':' + t.entity_id)) });
        if (merge.conflicts.length) {
            const proposalId = crypto.randomUUID();
            await db.prepare('INSERT INTO merge_proposals (id,project_id,actor,base_revision,head_revision,incoming,conflicts,created) VALUES (?,?,?,?,?,?,?,?)').bind(proposalId, id, actor, baseRevision, head.revision, JSON.stringify(project), JSON.stringify(merge.conflicts), Date.now()).run();
            fail('Some edits overlap with another saved version. Review the conflicting fields.', 409, { code: 'MERGE_CONFLICT', proposalId, headRevision: head.revision, conflicts: merge.conflicts });
        }
        const p = merge.project;
        p.id = id;
        p.revision = head.revision + 1;
        const doc = JSON.stringify(p), now = Date.now(), response = { project: p, merged: baseRevision !== head.revision, operationId, ...(resolutionHash ? { resolutionHash } : {}) };
        const guard = 'EXISTS (SELECT 1 FROM projects WHERE id=? AND revision=? AND last_operation_id=?)';
        const commitToken = crypto.randomUUID();
        const args = [id, p.revision, commitToken];
        const queries = [db.prepare("UPDATE projects SET name=?,document=?,revision=?,updated=?,last_operation_id=? WHERE id=? AND revision=? AND permission_epoch=? AND archived=0 AND NOT EXISTS (SELECT 1 FROM operations WHERE project_id=? AND operation_id=?) AND EXISTS (SELECT 1 FROM members WHERE project_id=? AND user_id=? AND role IN ('owner','editor'))").bind(p.name, doc, p.revision, now, commitToken, id, head.revision, head.permission_epoch, id, operationId, id, actor), db.prepare('INSERT OR IGNORE INTO versions (id,project_id,revision,document,author,created) SELECT ?,?,?,?,?,? WHERE ' + guard).bind(id + ':' + p.revision, id, p.revision, doc, name, now, ...args), db.prepare('INSERT OR IGNORE INTO operations (project_id,operation_id,actor,request_hash,response,created) SELECT ?,?,?,?,?,? WHERE ' + guard).bind(id, operationId, actor, requestHash, JSON.stringify(response), now, ...args), db.prepare('INSERT INTO audit_events (id,project_id,actor,action,detail,created) SELECT ?,?,?,?,?,? WHERE ' + guard).bind(crypto.randomUUID(), id, actor, 'project.commit', JSON.stringify({ revision: p.revision, baseRevision, operationId, merged: response.merged, documentHash: await digest(p) }), now, ...args)];
        if (resolvedProposalId)
            queries.push(db.prepare('UPDATE merge_proposals SET resolved=1 WHERE id=? AND project_id=? AND ' + guard).bind(resolvedProposalId, id, ...args));
        for (const t of merge.removed)
            queries.push(db.prepare('INSERT OR IGNORE INTO entity_tombstones (project_id,entity_type,entity_id,revision) SELECT ?,?,?,? WHERE ' + guard).bind(id, t.entity_type, t.entity_id, p.revision, ...args));
        const result = await db.batch(queries);
        if (result[0].meta.changes)
            return response;
        const receipt = await db.prepare('SELECT actor,request_hash,response FROM operations WHERE project_id=? AND operation_id=?').bind(id, operationId).first();
        if (receipt) {
            if (receipt.actor !== actor || receipt.request_hash !== requestHash)
                fail('Operation collision.', 409);
            return JSON.parse(receipt.response);
        }
        const role = await db.prepare('SELECT role FROM members WHERE project_id=? AND user_id=?').bind(id, actor).first();
        if (!role || !['owner', 'editor'].includes(role.role))
            fail('Edit access was revoked.', 403);
    }
    fail('Session changed repeatedly. Retry your save.', 409, { code: 'RETRY' });
}
export async function resolveProposal(db, id, actor, name, proposalId, { choices, headRevision, operationId }) { const resolutionHash = await digest({ proposalId, choices, headRevision, operationId }), receipt = await db.prepare('SELECT actor,response FROM operations WHERE project_id=? AND operation_id=?').bind(id, operationId).first(); if (receipt) {
    const response = JSON.parse(receipt.response);
    if (receipt.actor !== actor || response.resolutionHash !== resolutionHash)
        fail('Resolution operation id reused.', 409);
    return response;
} const proposal = await db.prepare('SELECT * FROM merge_proposals WHERE id=? AND project_id=? AND actor=?').bind(proposalId, id, actor).first(); if (!proposal || proposal.resolved)
    fail('Conflict proposal not found.', 404); const head = await db.prepare('SELECT document,revision FROM projects WHERE id=?').bind(id).first(); if (head.revision !== headRevision)
    fail('The project changed again. Save your edits to review current conflicts.', 409); const base = await db.prepare('SELECT document FROM versions WHERE project_id=? AND revision=?').bind(id, proposal.base_revision).first(); const tombstones = (await db.prepare('SELECT entity_type,entity_id FROM entity_tombstones WHERE project_id=?').bind(id).all()).results; const merged = mergeProject(JSON.parse(base.document), JSON.parse(proposal.incoming), JSON.parse(head.document), { choices: choices || {}, tombstones }); if (merged.conflicts.length)
    fail('Resolve every conflicting field; dependency conflicts require editing the project.', 409, { conflicts: merged.conflicts }); const result = await commitProject(db, id, actor, name, { project: merged.project, baseRevision: headRevision, operationId }, { resolvedProposalId: proposalId, resolutionHash, restoredIds: tombstones.filter(t => (t.entity_type==='effects.chain'?merged.project.effects.chain:merged.project[t.entity_type])?.some(e => e.id === t.entity_id)).map(t => t.entity_type + ':' + t.entity_id) }); return result; }
