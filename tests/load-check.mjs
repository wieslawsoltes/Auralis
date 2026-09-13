/** Reproducible local database concurrency probe; not a production capacity certification. */
import { performance } from 'node:perf_hooks';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { SQLiteAdapter } from '../server/local-adapters.mjs';
import { commitProject } from '../server/collaboration.js';
import { handleApi } from '../server/api.js';
import { createProject } from '../public/modules/session/model.js';
const db = new SQLiteAdapter();
for (const f of (await readdir(new URL('../drizzle', import.meta.url))).filter(f => f.endsWith('.sql')).sort())
    db.sqlite.exec(await readFile(new URL('../drizzle/' + f, import.meta.url), 'utf8'));
const response = await handleApi(new Request('https://test.invalid/api/projects', { method: 'POST', headers: { 'oai-authenticated-user-id': 'test-owner', 'content-type': 'application/json' }, body: JSON.stringify({ project: createProject() }) }), { DB: db });
const base = (await response.json()).project, start = performance.now(), count = 128, concurrency = 8, latencies = [];
let retries = 0, next = 0;
await Promise.all(Array.from({ length: concurrency }, async () => { while (next < count) {
    const index = next++, p = structuredClone(base), op = crypto.randomUUID(), begin = performance.now();
    p.markers.push({ id: 'load-marker-' + index, name: 'Load marker ' + index, time: index, color: '#aabbcc' });
    while (true) {
        try {
            await commitProject(db, p.id, 'test-owner', 'Test owner', { project: p, baseRevision: 1, operationId: op });
            break;
        }
        catch (e) {
            if (e.code !== 'RETRY')
                throw e;
            retries++;
        }
    }
    latencies.push(performance.now() - begin);
} }));
const elapsed = performance.now() - start, head = JSON.parse(db.sqlite.prepare('SELECT document FROM projects').get().document);
if (head.markers.length !== base.markers.length + count)
    throw Error('Lost markers');
if (head.revision !== count + 1)
    throw Error('Unexpected revisions');
const receipts = db.sqlite.prepare('SELECT COUNT(*) AS n FROM operations').get().n, audits = db.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='project.commit'").get().n;
if (receipts !== count || audits !== count)
    throw Error('Receipt/audit mismatch');
latencies.sort((a, b) => a - b);
const result = { kind: 'local SQLite API concurrency', node: process.version, operations: count, concurrency, elapsedMs: elapsed, operationsPerSecond: count / (elapsed / 1000), retryCount: retries, p50Ms: latencies[Math.floor(count * .5)], p95Ms: latencies[Math.floor(count * .95)], peakRSS: process.resourceUsage().maxRSS * 1024, retainedMarkers: head.markers.length, finalRevision: head.revision, receipts, audits, productionQualification: false };
console.log(JSON.stringify(result, null, 2));
if (process.argv[2])
    await writeFile(process.argv[2], JSON.stringify(result, null, 2));
db.close();
