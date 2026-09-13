#!/usr/bin/env node
/** EBU v5 regression runner. No fixture audio is included or downloaded.
 * Usage: node run-ebu.mjs /path/to/public/modules/audio /path/to/ebu-v5 [/path/to/report.json]
 * Obtain test audio separately from https://tech.ebu.ch/publications/ebu_loudness_test_set
 * Audio supplied by EBU is restricted to technical testing. Passing these selected tests is not certification.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const [audioArg, fixtureArg, outputArg] = process.argv.slice(2);
if (!audioArg || !fixtureArg) {
    console.error('Usage: node run-ebu.mjs AUDIO_MODULE_DIRECTORY EBU_V5_FIXTURE_DIRECTORY [OUTPUT_JSON]');
    process.exit(2);
}
const audioRoot = path.resolve(audioArg), fixtureRoot = path.resolve(fixtureArg), output = path.resolve(outputArg || 'ebu-results.json');
const hashes = {}, cache = new Map();
async function loadModule(file) { file = path.resolve(file); if (cache.has(file))
    return cache.get(file); const source = fs.readFileSync(file, 'utf8'); hashes[path.relative(audioRoot, file)] = crypto.createHash('sha256').update(source).digest('hex'); let code = source; const matches = [...source.matchAll(/\bfrom\s*(['"])(\.\/[^'"]+)\1/g)]; for (const match of matches) {
    const dependency = await loadModule(path.resolve(path.dirname(file), match[2]));
    code = code.replace(match[0], `from ${JSON.stringify(dependency.uri)}`);
} const uri = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64'); const result = { uri, mod: await import(uri) }; cache.set(file, result); return result; }
const { mod: { decodeWav } } = await loadModule(path.join(audioRoot, 'wav.js'));
const { mod: { analyze, LoudnessMeter } } = await loadModule(path.join(audioRoot, 'analysis.js'));
const expectedFor = name => { const e = {}, tc = Number(name.match(/^seq-3341-(\d+)-/)?.[1]); const value = (value, tolerance) => ({ value, tolerance }); if ([1, 3, 4, 5, 6].includes(tc) || name.startsWith('seq-3341-7_') || name.startsWith('seq-3341-2011-8_'))
    e.integrated = value(-23, .1); if (tc === 2)
    e.integrated = value(-33, .1); if (tc === 1 || tc === 2) {
    e.momentaryMax = value(tc === 1 ? -23 : -33, .1);
    e.shortTermMax = value(tc === 1 ? -23 : -33, .1);
} if (tc === 10)
    e.shortTermMax = value(-23, .1); if (tc === 13)
    e.momentaryMax = value(-23, .1); if (tc >= 15 && tc <= 23)
    e.truePeak = { value: tc <= 18 ? -6 : tc === 19 ? 3 : 0, lowerTolerance: .4, upperTolerance: .2 }; const lra = Number(name.match(/^seq-3342-(\d+)-/)?.[1]); if (lra >= 1 && lra <= 4)
    e.loudnessRange = value([10, 5, 20, 15][lra - 1], 1); if (name.startsWith('seq-3341-7_'))
    e.loudnessRange = value(5, 1); if (name.startsWith('seq-3341-2011-8_'))
    e.loudnessRange = value(15, 1); return { tc, expected: e }; };
const check = (metric, actual, expectation, extra = {}) => { const error = actual - expectation.value; return { metric, actual, target: expectation.value, error, lowerTolerance: expectation.lowerTolerance ?? expectation.tolerance, upperTolerance: expectation.upperTolerance ?? expectation.tolerance, pass: typeof actual === 'number' && Number.isFinite(actual) && error >= -(expectation.lowerTolerance ?? expectation.tolerance) - 1e-9 && error <= (expectation.upperTolerance ?? expectation.tolerance) + 1e-9, ...extra }; };
const names = fs.readdirSync(fixtureRoot).filter(n => n.toLowerCase().endsWith('.wav')).sort();
const required = [...([1, 2, 3, 4, 5, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23].map(i => ({ label: `3341 case ${i}`, pattern: new RegExp(`^seq-3341-${i}-`) }))), { label: '3341 case 7', pattern: /^seq-3341-7_/ }, { label: '3341 case 8', pattern: /^seq-3341-2011-8_/ }, ...Array.from({ length: 4 }, (_, i) => ({ label: `3342 case ${i + 1}`, pattern: new RegExp(`^seq-3342-${i + 1}-`) })), ...([10, 13].flatMap(tc => Array.from({ length: 20 }, (_, i) => ({ label: `3341 case ${tc}, segment ${i + 1}`, pattern: new RegExp(`^seq-3341-${tc}-${i + 1}-`) }))))];
const missingFixtures = required.filter(r => !names.some(n => r.pattern.test(n))).map(r => r.label);
const results = [];
for (const name of names) {
    const { tc, expected } = expectedFor(name), row = { file: name, expected, checks: [] };
    try {
        const b = fs.readFileSync(path.join(fixtureRoot, name));
        row.sha256 = crypto.createHash('sha256').update(b).digest('hex');
        const a = decodeWav(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
        const channelWeights = tc === 6 ? (a.channels.length === 5 ? [1, 1, 1, 1.41, 1.41] : a.channels.length === 6 ? [1, 1, 1, 0, 1.41, 1.41] : undefined) : undefined;
        const m = analyze(a.channels, a.sampleRate, { measureTruePeak: !!expected.truePeak, channelWeights });
        row.actual = { sampleRate: a.sampleRate, channels: a.channels.length, frames: m.frames, integrated: m.integrated, momentaryMax: m.momentaryMax, shortTermMax: m.shortTermMax, loudnessRange: m.loudnessRange, truePeak: m.truePeak };
        for (const [metric, e] of Object.entries(expected))
            row.checks.push(check(metric, m[metric], e));
        if ([9, 11, 12, 14].includes(tc)) {
            const meter = new LoudnessMeter(a.sampleRate, a.channels.length), hop = Math.round(a.sampleRate * .1);
            for (let at = 0; at < a.channels[0].length; at += hop) {
                const end = Math.min(at + hop, a.channels[0].length);
                meter.push(a.channels.map(c => c.subarray(at, end)));
                const t = end / a.sampleRate;
                // These current implementation fields expose the unsmoothed latest window energy.
                if (tc === 9 && t >= 3)
                    row.checks.push(check('shortTermCurrent', -.691 + 10 * Math.log10(Math.max(1e-30, meter.short / meter.shortSize)), { value: -23, tolerance: .1 }, { time: t }));
                if (tc === 12 && t >= 1)
                    row.checks.push(check('momentaryCurrent', -.691 + 10 * Math.log10(Math.max(1e-30, meter.moment / meter.momentSize)), { value: -23, tolerance: .1 }, { time: t }));
                if (tc === 11 && Math.abs(t / 6 - Math.round(t / 6)) < 1e-6)
                    row.checks.push(check('successiveMaxShortTerm', meter.result().shortTermMax, { value: -39 + Math.round(t / 6), tolerance: .1 }, { time: t }));
                if (tc === 14 && Math.abs(t / .8 - Math.round(t / .8)) < 1e-6)
                    row.checks.push(check('successiveMaxMomentary', meter.result().momentaryMax, { value: -39 + Math.round(t / .8), tolerance: .1 }, { time: t }));
            }
        }
        row.status = 'analyzed';
    }
    catch (error) {
        row.status = tc === 6 ? 'unsupported' : 'error';
        row.error = error.message;
    }
    results.push(row);
}
const checks = results.flatMap(r => r.checks), failures = results.flatMap(r => r.checks.filter(c => !c.pass).map(c => ({ file: r.file, ...c }))), errors = results.filter(r => r.status === 'error');
const report = { createdAt: new Date().toISOString(), audioRoot, fixtureRoot, sourceHashes: hashes, specifications: ['https://tech.ebu.ch/docs/tech/tech3341.pdf', 'https://tech.ebu.ch/docs/tech/tech3342.pdf'], scope: 'Named supported EBU v5 cases only. Fixture audio is separately obtained and technical-testing-only. Passing does not imply certification or complete standards compliance.', summary: { files: results.length, analyzed: results.filter(r => r.status === 'analyzed').length, unsupported: results.filter(r => r.status === 'unsupported').map(r => r.file), assertions: checks.length, passed: checks.filter(c => c.pass).length, failed: failures.length, errors: errors.length, missingFixtures }, results };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ output, ...report.summary, failures, errors }, null, 2));
if (failures.length || errors.length || missingFixtures.length)
    process.exitCode = 1;
