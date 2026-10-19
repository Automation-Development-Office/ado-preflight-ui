#!/usr/bin/env python3
"""Bundle only README documents from the shipped collection and UI checkout."""
import hashlib
import json
import os
import re
import subprocess
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
archives = list(Path(os.environ.get('ADO_ASSISTANT_COLLECTIONS', root / 'collections')).glob('infra-ado-*.tar.gz'))
archive = max(archives, key=lambda p: tuple(map(int, re.findall(r'\d+', p.name))))
documents = []
with tarfile.open(archive) as bundle:
    for member in sorted(bundle.getmembers(), key=lambda m: m.name):
        if not member.isfile() or not Path(member.name).name.lower().startswith('readme'):
            continue
        # Molecule scenario READMEs are operational notes, not role docs.
        if '/molecule/' in member.name.lower() or member.name.lower().startswith('extensions/molecule/'):
            continue
        stream = bundle.extractfile(member)
        documents.append({'path': 'infra.ado/' + member.name, 'text': stream.read().decode('utf-8', errors='replace')})
# Container builds have no .git. Source builds include tracked Preflight READMEs.
if (root / '.git').exists():
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
else:
    paths = ['README.md', 'docker/README.md', '.changeset/README.md']
for name in sorted(paths):
    p = root / name
    if name and p.is_file() and p.name.lower().startswith('readme'):
        documents.append({'path': 'ado-preflight-ui/' + name, 'text': p.read_text()})
output = root / 'public/assistant-knowledge.json'
output.parent.mkdir(exist_ok=True)
output.write_text(json.dumps({'collection': archive.name, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(), 'documents': documents}, ensure_ascii=False))
print(f'Bundled {len(documents)} READMEs from {archive.name} and Preflight')
