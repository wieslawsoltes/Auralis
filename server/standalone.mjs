import {closeNativeEditors} from './native-editors.mjs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { handleNative } from './native-api.mjs';
/** Local single-user standalone distribution. Hosted collaboration uses authenticated Sites ingress. */
import http from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { handleApi } from './api.js';
import { SQLiteAdapter, DiskBucket } from './local-adapters.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), state = path.resolve(process.env.AURALIS_DATA_DIR || path.join(root, '.auralis-data'));
await mkdir(state, { recursive: true });
const db = new SQLiteAdapter(path.join(state, 'studio.sqlite'));
db.sqlite.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
for (const name of (await readdir(path.join(root, 'drizzle'))).filter(f => f.endsWith('.sql')).sort()) {
    if (!db.sqlite.prepare('SELECT name FROM local_migrations WHERE name=?').get(name)) {
        db.sqlite.exec(await readFile(path.join(root, 'drizzle', name), 'utf8'));
        db.sqlite.prepare('INSERT INTO local_migrations(name) VALUES (?)').run(name);
    }
}
const bucket = new DiskBucket(path.join(state, 'audio'));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.map': 'application/json' };
const server = http.createServer(async (req, res) => {
    try {
        const port = server.address().port;
        if (!['127.0.0.1:' + port, 'localhost:' + port].includes(req.headers.host)) {
            res.writeHead(403);
            res.end('Invalid host');
            return;
        }
        const url = new URL(req.url, 'http://' + req.headers.host);
        if (url.pathname.startsWith('/api/')) {
            const headers = new Headers();
            for (const [k, v] of Object.entries(req.headers))
                if (v && !k.startsWith('oai-authenticated-'))
                    headers.set(k, Array.isArray(v) ? v.join(',') : v);
            headers.set('oai-authenticated-user-id', 'local-owner');
            headers.set('oai-authenticated-user-email', 'local@auralis.invalid');
            headers.set('oai-authenticated-user-full-name', 'Local owner');
            const request = new Request(url, { method: req.method, headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: req, duplex: 'half' } : {}) });
            const response = url.pathname.startsWith('/api/native/') ? await handleNative(request, root) : await handleApi(request, { DB: db, BUCKET: bucket });
            res.writeHead(response.status, Object.fromEntries(response.headers));
            if (response.body)
                await pipeline(Readable.fromWeb(response.body), res);
            else
                res.end();
            return;
        }
        const relative = url.pathname === '/' ? '/studio/index.html' : decodeURIComponent(url.pathname), publicRoot = path.join(root, 'public'), file = path.resolve(publicRoot, '.' + relative);
        if (!file.startsWith(publicRoot + path.sep))
            throw Error('Invalid path');
        const data = await readFile(file);
        res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
        res.end(data);
    }
    catch (e) {
        if (res.headersSent || res.destroyed) { res.destroy(); return; }
        res.writeHead(e.code === 'ENOENT' ? 404 : 500, { 'content-type': 'text/plain' });
        res.end('Resource unavailable.');
    }
});
server.listen(Number(process.env.AURALIS_PORT || 4173), '127.0.0.1', () => console.log('Auralis Studio: http://127.0.0.1:' + server.address().port));

process.on('exit',closeNativeEditors);
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{closeNativeEditors();server.close();setTimeout(()=>process.exit(0),200).unref();});
