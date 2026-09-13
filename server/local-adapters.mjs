import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { stat } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
export class SQLiteAdapter {
    constructor(filename = ':memory:') { this.sqlite = new DatabaseSync(filename); this.sqlite.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;'); }
    prepare(sql) { const db = this.sqlite; let args = []; return { bind(...values) { args = values; return this; }, async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; }, _run() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, async run() { return this._run(); } }; }
    async batch(statements) {
        this.sqlite.exec('BEGIN IMMEDIATE');
        try {
            const result = [];
            for (const q of statements)
                result.push(q._run());
            this.sqlite.exec('COMMIT');
            return result;
        }
        catch (e) {
            this.sqlite.exec('ROLLBACK');
            throw e;
        }
    }
    close() { this.sqlite.close(); }
}
export class DiskBucket {
    constructor(directory) { this.directory = path.resolve(directory); }
    file(key) {
        const p = path.resolve(this.directory, key);
        if (!p.startsWith(this.directory + path.sep))
            throw Error('Invalid object key');
        return p;
    }
    async put(key, bytes) { const p = this.file(key); await mkdir(path.dirname(p), { recursive: true }); await writeFile(p, new Uint8Array(bytes.buffer || bytes, bytes.byteOffset || 0, bytes.byteLength)); }
    async get(key, options = {}) { try {
        await stat(this.file(key));
        const range = options.range;
        return { body: Readable.toWeb(createReadStream(this.file(key), range ? { start: range.offset, end: range.offset + range.length - 1 } : {})) };
    }
    catch (e) {
        if (e.code === 'ENOENT')
            return null;
        throw e;
    } }
    async delete(key) {
        try {
            await unlink(this.file(key));
        }
        catch (e) {
            if (e.code !== 'ENOENT')
                throw e;
        }
    }
}
