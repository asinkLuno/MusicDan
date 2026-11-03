"""Run under .publish.lock, after switching latest. Only delete known release artifacts."""
import json
import re
import shutil
import sys
from pathlib import Path

base = Path(sys.argv[1]).resolve()
public = base / 'public'
releases = public / 'releases'
history = json.loads((public / 'releases.json').read_text())
assert 0 < len(history) <= 3, 'Expected at most three published versions'
protected = {(public / 'latest').resolve(), (base / 'site').resolve()}
keep_names = set()
keep_builds = set()
for entry in history:
    name = entry['name']
    assert re.fullmatch(r'MusicDan_[0-9]+\.[0-9]+\.[0-9]+_arm64\.apk', name), 'Unexpected APK name'
    keep_names.update((name, name + '.sha256'))
    number = entry.get('build_number')
    if number is None:
        match = re.search(r'/build-(\d+)(?:/|$)', entry.get('release_url', '') or entry.get('github_url', ''))
        assert match, 'Missing build number'
        number = int(match[1])
    directory = releases / f'build-{number}'
    keep_builds.add(directory.name)
    apk = directory / name if directory.exists() else releases / name
    assert apk.is_file(), f'Retained APK missing: {apk}'
    protected.add(apk.resolve())
    if (directory / 'site').exists():
        protected.add((directory / 'site').resolve())

def remove(candidate):
    resolved = candidate.resolve()
    if any(resolved == item or resolved in item.parents for item in protected):
        return
    if candidate.is_symlink() or candidate.is_file():
        candidate.unlink()
    elif candidate.is_dir():
        shutil.rmtree(candidate)
    print(f'[retention] removed {candidate}')

# Validate all retained versions before removing anything. Never follow a symlink
# for deletion and never prune the active website or a retained site's target.
for candidate in releases.iterdir():
    if re.fullmatch(r'build-\d+', candidate.name) and candidate.name not in keep_builds:
        remove(candidate)
    elif re.fullmatch(r'MusicDan_[0-9]+\.[0-9]+\.[0-9]+_arm64\.apk(?:\.sha256)?', candidate.name) and candidate.name not in keep_names:
        remove(candidate)
for candidate in base.glob('site-*'):
    remove(candidate)
for candidate in public.iterdir():
    if candidate.name == '.latest-legacy' or re.fullmatch(r'\.latest-before-\d+', candidate.name):
        remove(candidate)
print('[retention] retained ' + ', '.join(entry['version'] for entry in history))
