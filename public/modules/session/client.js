export const isStaticDeployment=typeof document!=='undefined'&&document.querySelector('meta[name="auralis-hosting"]')?.content==='static';
export function apiURL(path){if(isStaticDeployment)throw Error('This browser edition has no project server. Download your project JSON and audio, or run the standalone app for saved projects, collaboration and native plug-ins.');return new URL('../../api/'+String(path).replace(/^\/api\//,''),import.meta.url).href;}
export function apiFetch(path,options){return fetch(apiURL(path),options);}
import { randomId } from '../audio/ids.js';
export class SessionClient {
    async request(path, options = {}) {
        const r = await apiFetch(path, { ...options, headers: options.body instanceof Blob ? options.headers : { 'content-type': 'application/json', ...options.headers } });
        const body = r.headers.get('content-type')?.includes('application/json') ? await r.json() : await r.blob();
        if (!r.ok) {
            const e = Error(body.error || 'Request failed (' + r.status + ')');
            e.status = r.status;
            e.body = body;
            throw e;
        }
        return body;
    }
    watch(id, onChange, onRevoke) { const events = new EventSource(apiURL('projects/' + id + '/events')); events.addEventListener('session', e => onChange(JSON.parse(e.data))); events.addEventListener('revoked', () => { events.close(); onRevoke?.(); }); return events; }
    admin(id) { return this.request('projects/' + id + '/admin'); }
    configure(id, change) { return this.request('projects/' + id + '/admin', { method: 'PATCH', body: JSON.stringify(change) }); }
    revokeInvitations(id) { return this.request('projects/' + id + '/invite', { method: 'DELETE' }); }
    resolveConflict(id, proposalId, headRevision, choices) { return this.request('projects/' + id + '/conflicts/' + proposalId + '/resolve', { method: 'POST', body: JSON.stringify({ headRevision, choices, operationId: randomId() }) }); }
    me() { return this.request('me'); }
    list() { return this.request('projects'); }
    load(id) { return this.request('projects/' + id); }
    create(project) { return this.request('projects', { method: 'POST', body: JSON.stringify({ project }) }); }
    save(project) { return this.request('projects/' + project.id, { method: 'PUT', body: JSON.stringify({ project, baseRevision: project.revision, operationId: randomId() }) }); }
    async uploadFile(id, asset, file, onProgress) { const base = 'projects/' + id + '/assets/' + asset.id + '/upload', upload = await this.request(base, { method: 'POST', body: JSON.stringify({ size: file.size, name: asset.name }) }); for (let part = 0; part < upload.parts; part++) {
        await this.request(base + '/' + upload.uploadId + '/' + part, { method: 'PUT', body: file.slice(part * upload.chunkSize, (part + 1) * upload.chunkSize), headers: { 'content-type': 'application/octet-stream' } });
        onProgress?.((part + 1) / upload.parts);
    } return this.request(base + '/' + upload.uploadId + '/complete', { method: 'POST', body: '{}' }); }
    upload(id, asset, bytes) { return this.request('projects/' + id + '/assets/' + asset.id, { method: 'PUT', body: new Blob([bytes], { type: 'audio/wav' }), headers: { 'content-type': 'audio/wav', 'x-file-name': encodeURIComponent(asset.name) } }); }
    audio(id, assetId) { return this.request('projects/' + id + '/assets/' + assetId); }
    comments(id) { return this.request('projects/' + id + '/comments'); }
    comment(id, text, time) { return this.request('projects/' + id + '/comments', { method: 'POST', body: JSON.stringify({ text, time }) }); }
    resolve(id, commentId, resolved) { return this.request('projects/' + id + '/comments', { method: 'PATCH', body: JSON.stringify({ id: commentId, resolved }) }); }
    presence(id, position) { return this.request('projects/' + id + '/presence', { method: 'POST', body: JSON.stringify({ position }) }); }
    invite(id, role) { return this.request('projects/' + id + '/invite', { method: 'POST', body: JSON.stringify({ role }) }); }
    join(token) { return this.request('join', { method: 'POST', body: JSON.stringify({ token }) }); }
    versions(id) { return this.request('projects/' + id + '/versions'); }
    version(id, revision) { return this.request('projects/' + id + '/versions/' + revision); }
}
