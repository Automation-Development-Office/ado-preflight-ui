#!/usr/bin/env python3
"""Build the assistant bundle from the collection tarball Preflight executes."""
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SECRET_LINE = re.compile(
    r'(-----BEGIN [A-Z ]*PRIVATE KEY-----|ghp_[A-Za-z0-9]{20,}|github_pat_|Bearer\s+eyJ[A-Za-z0-9._-]{20,})'
)


def version_key(path):
    nums = tuple(int(part) for part in re.findall(r'\d+', Path(path).name))
    return nums or (0,)


def choose_archive(paths):
    files = [Path(path) for path in paths if path]
    if not files:
        return None
    return max(files, key=lambda path: (version_key(path), path.name))


def iter_archives(directory):
    directory = Path(directory)
    if directory.is_file() and directory.name.startswith('infra-automation_development_office-') and directory.name.endswith('.tar.gz'):
        return [directory]
    if not directory.is_dir():
        return []
    return sorted(directory.glob('infra-automation_development_office-*.tar.gz'))


def add_doc(documents, seen, doc_path, text):
    if SECRET_LINE.search(text):
        raise SystemExit(f'Refusing to index possible secret material in {doc_path}')
    key = doc_path.replace('\\', '/')
    if key in seen:
        return
    seen.add(key)
    documents.append({'path': key, 'text': text})


def add_file(documents, seen, doc_path, file_path):
    if file_path.is_file():
        add_doc(documents, seen, doc_path, file_path.read_text(encoding='utf-8', errors='replace'))


def collection_members(archive, documents, seen):
    import tarfile
    with tarfile.open(archive) as bundle:
        for member in sorted(bundle.getmembers(), key=lambda item: item.name):
            if not member.isfile():
                continue
            name = member.name.replace('\\', '/')
            lower = name.lower()
            if '/molecule/' in lower or lower.startswith('extensions/molecule/'):
                continue
            is_readme = Path(name).name.lower().startswith('readme')
            is_module = lower.startswith('docs/') and lower.endswith('.md')
            is_agents = Path(name).name == 'AGENTS.md'
            if not (is_readme or is_module or is_agents):
                continue
            stream = bundle.extractfile(member)
            if stream is None:
                continue
            add_doc(documents, seen, 'infra.automation_development_office/' + name, stream.read().decode('utf-8', errors='replace'))


def preflight_docs(documents, seen):
    if (ROOT / '.git').exists():
        listed = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    else:
        listed = ['README.md', 'docker/README.md', '.changeset/README.md', 'known-bugs.md']
    for name in sorted(listed):
        path = ROOT / name
        if name and path.is_file() and path.name.lower().startswith('readme'):
            add_file(documents, seen, 'ado-preflight-ui/' + name, path)
    for extra in (
        ROOT / 'known-bugs.md',
        ROOT / 'README.md',
        ROOT / 'docs' / 'TROUBLESHOOTING.md',
        ROOT / 'docs' / 'ADO_ASSISTANT.md',
        ROOT / 'docs' / 'ADO_DEVELOPMENT_MODEL.md',
        ROOT / 'docs' / 'hub-recovery.md',
        ROOT / 'docs' / 'RELEASING.md',
    ):
        if extra.is_file():
            add_file(documents, seen, 'ado-preflight-ui/' + extra.relative_to(ROOT).as_posix(), extra)
    trouble = ROOT / 'docs' / 'troubleshooting'
    if trouble.is_dir():
        for path in sorted(trouble.glob('*.md')):
            add_file(documents, seen, 'ado-preflight-ui/' + path.relative_to(ROOT).as_posix(), path)
    sourced = ROOT / 'docs' / 'knowledge-sources'
    if sourced.is_dir():
        for path in sorted(sourced.glob('*.md')):
            add_file(documents, seen, 'ado-preflight-ui/' + path.relative_to(ROOT).as_posix(), path)
    sibling = ROOT.parent / 'ado'
    for relative in ('AGENTS.md', 'docs/ADO_DEVELOPMENT_MODEL.md'):
        path = sibling / relative
        if path.is_file():
            add_file(documents, seen, 'infra.automation_development_office/' + relative, path)


def main():
    configured = os.environ.get('ADO_COLLECTION_ARCHIVE') or os.environ.get('ADO_ASSISTANT_COLLECTIONS')
    directory = Path(configured) if configured else ROOT / 'collections'
    archive = choose_archive(iter_archives(directory))
    if archive is None:
        raise SystemExit(f'No infra-automation_development_office-*.tar.gz under {directory}')
    documents = []
    seen = set()
    collection_members(archive, documents, seen)
    preflight_docs(documents, seen)
    output = ROOT / 'public' / 'assistant-knowledge.json'
    output.parent.mkdir(exist_ok=True)
    payload = {
        'collection': archive.name,
        'sha256': hashlib.sha256(archive.read_bytes()).hexdigest(),
        'documents': documents,
    }
    output.write_text(json.dumps(payload, ensure_ascii=False))
    print(f'Bundled {len(documents)} documents from {archive.name} and Preflight')


if __name__ == '__main__':
    main()
