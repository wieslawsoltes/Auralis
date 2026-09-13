import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),output=path.join(root,'out/pages');
await rm(output,{recursive:true,force:true});await mkdir(output,{recursive:true});await cp(path.join(root,'public'),output,{recursive:true});
for(const file of ['studio/index.html','studio/detached.html']){const target=path.join(output,file);let html=await readFile(target,'utf8');html=html.replace('<head>','<head><meta name="auralis-hosting" content="static">');await writeFile(target,html);}
await writeFile(path.join(output,'.nojekyll'),'');
// Fail the build if a required entry point or audio worker is missing.
for(const file of ['index.html','studio/index.html','studio/app.js','modules/audio/worker.js','modules/audio/worklet.js','modules/audio/qualification-worklet.js','studio/detached.html','favicon.svg'])await readFile(path.join(output,file));
console.log('GitHub Pages static site prepared at '+output);
