import {handleNativeEditors,nativeArguments,decodeState} from './native-editors.mjs';
import {validateChain} from '../public/modules/audio/chain-config.js';
import {processMaster} from '../public/modules/audio/dsp.js';
import {encodeWav,decodeWav} from '../public/modules/audio/wav.js';
import { readFile, mkdtemp, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { zipFiles } from '../public/modules/audio/authoring.js';
const run = (file, args, cwd) => new Promise((resolve, reject) => { const p = spawn(file, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], shell: false }); let output = ''; const timer = setTimeout(() => p.kill('SIGKILL'), 180000); for (const s of [p.stdout, p.stderr])
    s.on('data', b => { output = (output + b).slice(-16000); }); p.on('error', e => { clearTimeout(timer); reject(e); }); p.on('close', code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(Error('Native operation failed: ' + output)); }); });
let busy = false;
export async function handleNative(request, root) {
    const url = new URL(request.url);
    if (request.headers.get('origin') && request.headers.get('origin') !== url.origin)
        return Response.json({ error: 'Cross-origin native request rejected.' }, { status: 403 });
    try {
        const config = process.env.AURALIS_PLUGIN_CONFIG ? JSON.parse(await readFile(process.env.AURALIS_PLUGIN_CONFIG, 'utf8')) : [], plugins = config.filter(p => ['clap', 'vst3', 'au'].includes(p.format) && typeof p.id === 'string');
        if (url.pathname === '/api/native/plugins')
            return Response.json({ plugins: plugins.map(({ id, name, format }) => ({ id, name, format })), editors: process.platform==='linux'&&!!process.env.DISPLAY, ddp: !!process.env.AURALIS_CUE2DDP && !!process.env.AURALIS_DDPINFO });
        const editorResponse=await handleNativeEditors(request,root,plugins);if(editorResponse)return editorResponse;
        if (request.method !== 'POST')
            return Response.json({ error: 'Method not allowed.' }, { status: 405 });
        if (busy)
            return Response.json({ error: 'A native job is already running.' }, { status: 409 });
        busy = true;
        let directory;
        try {
            directory = await mkdtemp(path.join(tmpdir(), 'auralis-native-'));
            const chunks = [];
            let size = 0;
            for await (const part of request.body) {
                size += part.length;
                if (size > 96 * 1024 * 1024)
                    throw Error('Native browser handoff exceeds96MB. Use the CLI for large files.');
                chunks.push(part);
            }
            const bytes = Buffer.concat(chunks.map(c => Buffer.from(c)));
            if (url.pathname === '/api/native/render-chain') {
                if(bytes.length<4)throw Error('Incomplete chain render.');const size=bytes.readUInt32LE(0);if(size>4*1024*1024||size+4>=bytes.length)throw Error('Invalid chain header.');const {effects}=JSON.parse(bytes.subarray(4,4+size).toString('utf8'));validateChain(effects.chain);const audio=decodeWav(bytes.buffer.slice(bytes.byteOffset+4+size,bytes.byteOffset+bytes.length));let channels=audio.channels;let builtin=[];const flushBuiltins=()=>{if(builtin.length){channels=processMaster(channels,audio.sampleRate,{chain:builtin});builtin=[];}};
                for(const node of effects.chain){if(effects.bypass)continue;if(node.type!=='native'){builtin.push(node);continue;}if(!node.enabled||node.wet===0)continue;flushBuiltins();const plugin=plugins.find(p=>p.id===node.params.pluginId);if(!plugin)throw Error('Native insert is not configured: '+node.params.pluginId);await writeFile(path.join(directory,'input.wav'),Buffer.from(encodeWav(channels,audio.sampleRate,{bits:32,float:true})));const args=plugin.format==='au'?[plugin.subtype,plugin.manufacturer,'input.wav','output.wav']:[plugin.path,'input.wav','output.wav',...nativeArguments(plugin)];const state=decodeState(node.params.state);if(state){if(plugin.format==='au')throw Error('This AU host does not load the cross-platform state envelope.');await writeFile(path.join(directory,'state.bin'),state);args.push('--state-in','state.bin');}args.push(...(node.params.parameters||[]));await run(path.join(root,'native/build/auralis-'+plugin.format),args,directory);const b=await readFile(path.join(directory,'output.wav')),result=decodeWav(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));if(result.sampleRate!==audio.sampleRate||result.channels.length!==channels.length||result.channels[0].length!==channels[0].length)throw Error('Native insert changed the audio format.');channels=result.channels.map((ch,c)=>ch.map((v,i)=>channels[c][i]+(v-channels[c][i])*node.wet));}
                flushBuiltins();return new Response(encodeWav(channels,audio.sampleRate,{bits:32,float:true}),{headers:{'content-type':'audio/wav','cache-control':'no-store'}});
            }
            if (url.pathname === '/api/native/render') {
                await writeFile(path.join(directory, 'input.wav'), bytes);
                const plugin = plugins.find(p => p.id === request.headers.get('x-plugin-id'));
                if (!plugin)
                    throw Error('Select a configured native plugin.');
                const params = JSON.parse(request.headers.get('x-plugin-parameters') || '[]');
                if (!Array.isArray(params) || params.length > 256 || params.some(p => !/^\d+=[-+\d.eE]+$/.test(p)))
                    throw Error('Invalid parameter list.');
                const args = plugin.format === 'au' ? [plugin.subtype, plugin.manufacturer, 'input.wav', 'output.wav'] : [plugin.path, 'input.wav', 'output.wav', ...nativeArguments(plugin), ...params];
                await run(path.join(root, 'native/build/auralis-' + plugin.format), args, directory);
                return new Response(await readFile(path.join(directory, 'output.wav')), { headers: { 'content-type': 'audio/wav', 'cache-control': 'no-store' } });
            }
            if (url.pathname === '/api/native/ddp') {
                if (!process.env.AURALIS_CUE2DDP || !process.env.AURALIS_DDPINFO)
                    throw Error('Configure the external cue2ddp and ddpinfo executables.');
                if (bytes.length < 4)
                    throw Error('Incomplete DDP job.');
                const cueLength = bytes.readUInt32LE(0);
                if (cueLength > 64000 || cueLength + 4 > bytes.length)
                    throw Error('Invalid CUE length.');
                const cue = bytes.subarray(4, 4 + cueLength).toString('utf8');
                if (cue.length > 40000 || !cue.includes('FILE "album.wav" WAVE') || cue.split(/\r?\n/).filter(line => /^\s*FILE\b/i.test(line)).some(line => line.trim() !== 'FILE "album.wav" WAVE') || /[^\u0000-\u00ff]/.test(cue))
                    throw Error('DDP needs one album.wav CUE with Latin1 CD-Text.');
                await writeFile(path.join(directory, 'album.wav'), bytes.subarray(4 + cueLength));
                await writeFile(path.join(directory, 'album.cue'), cue, 'latin1');
                const { mkdir } = await import('node:fs/promises');
                await mkdir(path.join(directory, 'ddp'));
                await run(process.env.AURALIS_CUE2DDP, ['-t', '-m', 'Auralis Studio', 'album.cue', 'ddp'], directory);
                const verification = await run(process.env.AURALIS_DDPINFO, ['--verify', 'ddp'], directory);
                const files = [];
                for (const file of await readdir(path.join(directory, 'ddp')))
                    files.push([file, await readFile(path.join(directory, 'ddp', file))]);
                files.push(['verification.txt', verification]);
                return new Response(zipFiles(files), { headers: { 'content-type': 'application/zip', 'cache-control': 'no-store' } });
            }
            return Response.json({ error: 'Unknown native operation.' }, { status: 404 });
        }
        finally {
            busy = false;
            if (directory)
                await rm(directory, { recursive: true, force: true });
        }
    }
    catch (e) {
        return Response.json({ error: e.message }, { status: 400 });
    }
}
