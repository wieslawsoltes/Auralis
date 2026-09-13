import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { runInNewContext } from 'node:vm';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
let fixture, output, server, origin;
const initialHTML = new Map();

before(async () => {
    // Build an isolated copy: tests must not rewrite a live Pages artifact or public source.
    fixture = await mkdtemp(path.join(tmpdir(), 'auralis-pages-'));
    await mkdir(path.join(fixture, 'scripts'));
    await cp(path.join(root, 'scripts/build-pages.mjs'), path.join(fixture, 'scripts/build-pages.mjs'));
    await cp(path.join(root, 'public'), path.join(fixture, 'public'), { recursive: true });
    for (const file of ['studio/index.html', 'studio/detached.html'])
        initialHTML.set(file, await readFile(path.join(fixture, 'public', file), 'utf8'));
    await exec(process.execPath, ['scripts/build-pages.mjs'], { cwd: fixture });
    output = path.join(fixture, 'out/pages');
    server = createServer(async (req, res) => {
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/Auralis/')) {
            res.writeHead(404).end('Outside the project mount');
            return;
        }
        try {
            let file = path.join(output, decodeURIComponent(url.pathname.slice('/Auralis/'.length)));
            if (!file.startsWith(output + path.sep) && file !== output) throw Error('Invalid path');
            if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
            const body = await readFile(file);
            const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
            res.writeHead(200, { 'content-type': type }).end(body);
        } catch {
            // No SPA fallback: a wrong asset URL must actually fail this test.
            res.writeHead(404).end('Missing static asset');
        }
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    origin = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
    if (server) {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
    if (fixture) await rm(fixture, { recursive: true, force: true });
});

async function asset(reference, base = origin + '/Auralis/') {
    const url = new URL(reference, base);
    assert.equal(url.origin, origin, 'A deployment asset must stay on the deployed origin: ' + url);
    assert.ok(url.pathname.startsWith('/Auralis/'), 'Asset escaped the project subpath: ' + url);
    const response = await fetch(url);
    assert.equal(response.status, 200, 'Missing deployment asset: ' + url);
    return { url: url.href, text: await response.text(), type: response.headers.get('content-type') };
}

test('Pages build marks both workspaces static and preserves server-enabled source HTML', async () => {
    for (const [file, original] of initialHTML) {
        assert.doesNotMatch(original, /name=["']auralis-hosting["']\s+content=["']static["']/);
        assert.equal(await readFile(path.join(fixture, 'public', file), 'utf8'), original);
        assert.equal(await readFile(path.join(root, 'public', file), 'utf8'), original);
        const built = await asset(file);
        assert.match(built.text, /<meta name="auralis-hosting" content="static">/);
    }
    assert.equal(await readFile(path.join(output, '.nojekyll'), 'utf8'), '');
});

test('Pages root opens the project workspace and retains invitation hashes and query strings', async () => {
    const { text: html } = await asset('./');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    assert.ok(script, 'Root entry point needs a redirect');
    let destination;
    const href = origin + '/Auralis/?session=example#join=invitation-token';
    runInNewContext(script, { URL, location: { href, search: '?session=example', hash: '#join=invitation-token', replace: url => { destination = url; } } });
    assert.equal(destination, origin + '/Auralis/studio/?session=example#join=invitation-token');
    await asset(destination);
});

test('HTML assets, module graph, workers and detached workspace resolve beneath /Auralis/', async () => {
    const modules = new Set(), queue = [];
    for (const file of ['index.html', 'studio/index.html', 'studio/detached.html']) {
        const page = await asset(file);
        for (const match of page.text.matchAll(/\b(?:src|href)=["']([^"']+)["']/g)) {
            const loaded = await asset(match[1], page.url);
            if (new URL(loaded.url).pathname.endsWith('.js')) queue.push(loaded.url);
        }
    }
    while (queue.length) {
        const url = queue.shift();
        if (modules.has(url)) continue;
        modules.add(url);
        const loaded = await asset(url);
        assert.match(loaded.type, /javascript/, 'Module response must be JavaScript: ' + url);
        const references = [
            ...loaded.text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/g),
            ...loaded.text.matchAll(/\bnew URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/g),
        ];
        for (const match of references) {
            const target = await asset(match[1], loaded.url);
            if (new URL(target.url).pathname.endsWith('.js')) queue.push(target.url);
        }
    }
    for (const file of ['studio/app.js', 'studio/detached.js', 'modules/audio/worker.js', 'modules/audio/worklet.js', 'modules/audio/qualification-worklet.js'])
        assert.ok(modules.has(origin + '/Auralis/' + file), 'Module graph must include ' + file);
    assert.ok(modules.size >= 20, 'Verify the full workstation dependency graph');
    // Generated UI HTML has its own relative icon/download URLs; resolve those as a browser would.
    for (const file of ['studio/app.js', 'studio/workstation.js']) {
        const { text: code } = await asset(file);
        for (const match of code.matchAll(/\b(?:src|href)=["']([^"'$]+)["']/g))
            await asset(match[1], origin + '/Auralis/studio/');
    }
    const { text: windows } = await asset('studio/window-manager.js');
    const popup = windows.match(/new URL\(["']([^"']+)["']\s*\+\s*nonce\s*,\s*import\.meta\.url\)/);
    assert.ok(popup, 'Detached URL should resolve from the window-manager module');
    await asset(popup[1] + 'test-window', origin + '/Auralis/studio/window-manager.js');
    assert.equal((await fetch(origin + '/studio/app.js')).status, 404, 'Server must not hide broken root-relative paths');
});

async function withDocument(meta, fn) {
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'document');
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { querySelector: selector => selector === 'meta[name="auralis-hosting"]' ? meta : null } });
    try { return await fn(); }
    finally { if (prior) Object.defineProperty(globalThis, 'document', prior); else delete globalThis.document; }
}

test('Static session client rejects cloud and native requests before making network calls', async t => {
    let requests = 0, streams = 0;
    t.mock.method(globalThis, 'fetch', () => { requests++; throw Error('Unexpected network request'); });
    const prior = Object.getOwnPropertyDescriptor(globalThis, 'EventSource');
    Object.defineProperty(globalThis, 'EventSource', { configurable: true, value: class { constructor() { streams++; } } });
    t.after(() => { if (prior) Object.defineProperty(globalThis, 'EventSource', prior); else delete globalThis.EventSource; });
    await withDocument({ content: 'static' }, async () => {
        const module = await import(pathToFileURL(path.join(output, 'modules/session/client.js')).href + '?static-test');
        assert.equal(module.isStaticDeployment, true);
        const client = new module.SessionClient(), unavailable = /no project server.*standalone/i;
        for (const operation of [() => client.me(), () => client.list(), () => client.create({}), () => client.save({ id: 'p', revision: 1 }), () => client.invite('p', 'editor')])
            await assert.rejects(operation, unavailable);
        assert.throws(() => client.watch('p', () => {}), unavailable);
        assert.throws(() => module.apiFetch('/api/native/render', { method: 'POST' }), unavailable);
        assert.throws(() => module.apiURL('projects/p/assets/a'), unavailable);
        assert.equal(requests, 0);
        assert.equal(streams, 0);
    });
});

test('Unmarked source remains server-enabled and resolves both session and native API paths', async t => {
    const calls = [];
    t.mock.method(globalThis, 'fetch', async (url, options) => {
        calls.push({ url, options });
        return new Response(JSON.stringify({ name: 'Standalone user' }), { headers: { 'content-type': 'application/json' } });
    });
    await withDocument(null, async () => {
        const location = pathToFileURL(path.join(root, 'public/modules/session/client.js'));
        const module = await import(location.href + '?server-test');
        assert.equal(module.isStaticDeployment, false);
        const expected = new URL('../../api/', location);
        assert.equal(module.apiURL('projects/p/assets/a'), new URL('projects/p/assets/a', expected).href);
        assert.equal(module.apiURL('/api/native/plugins'), new URL('native/plugins', expected).href);
        assert.deepEqual(await new module.SessionClient().me(), { name: 'Standalone user' });
        assert.equal(calls.length, 1);
        assert.equal(calls[0].url, new URL('me', expected).href);
    });
});
