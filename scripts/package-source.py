#!/usr/bin/env python3
"""Package tracked and unignored source, excluding data, builds and generated archives."""
import json, pathlib, subprocess, zipfile
root=pathlib.Path(__file__).resolve().parents[1]
version=json.loads((root/'package.json').read_text())['version']
out=root/'public/downloads';out.mkdir(parents=True,exist_ok=True)
for name in ['audio','renderer','controls']:
    subprocess.run(['npm','pack','--pack-destination',str(out),'--silent'],cwd=root/'public/modules'/name,check=True)
files=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=root).decode().split('\0')
archive=out/f'AuralisStudio-{version}-source.zip'
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
    for relative in sorted(set(files)):
        if not relative or relative.startswith(('public/downloads/','dist/','node_modules/','desktop/node_modules/','native/build/','.auralis-data/','.openai/','.agents/','.sites-runtime/')): continue
        p=root/relative
        if p.is_file() and not p.is_symlink():z.write(p,f'AuralisStudio-{version}/{relative}')
print(str(archive))
