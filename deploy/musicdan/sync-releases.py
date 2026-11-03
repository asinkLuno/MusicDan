#!/usr/bin/env python3
"""Mirror published, SHA-256 verified APKs without GitHub or server credentials."""
import argparse
import fcntl
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import struct
import tarfile
import tempfile
import urllib.request

REPO = 'asinkLuno/MusicDan'
API = f'https://api.github.com/repos/{REPO}'
APK_NAME = re.compile(r'MusicDan_(\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?)_arm64\.apk')
SAFE_TAG = re.compile(r'[A-Za-z0-9][A-Za-z0-9._-]{0,100}')


def request(url, accept='application/vnd.github+json'):
    return urllib.request.urlopen(urllib.request.Request(url, headers={
        'User-Agent': 'MusicDan-release-mirror',
        'Accept': accept,
    }), timeout=60)


def read_json(url):
    with request(url) as response:
        return json.load(response)


def write_json(path, data):
    temporary = path.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def mirror_release(root, release):
    if release.get('draft') or release.get('prerelease'):
        return None
    tag = release['tag_name']
    if not SAFE_TAG.fullmatch(tag):
        raise ValueError(f'Unsafe release tag: {tag!r}')
    assets = [asset for asset in release['assets'] if APK_NAME.fullmatch(asset['name'])]
    if len(assets) != 1:
        raise ValueError(f'{tag}: expected one arm64 APK, found {len(assets)}')
    asset = assets[0]
    name = asset['name']
    digest = asset.get('digest', '')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError(f'{tag}: GitHub SHA-256 digest is required')
    destination = root / 'releases' / tag
    if destination.exists():
        metadata = json.loads((destination / 'release.json').read_text())
        if metadata['sha256'] != digest[7:] or metadata['size'] != asset['size']:
            raise ValueError(f'{tag}: published asset changed; refusing to overwrite')
        with (destination / name).open('rb') as cached:
            if hashlib.file_digest(cached, 'sha256').hexdigest() != digest[7:]:
                raise ValueError(f'{tag}: cached APK is corrupt')
        return metadata
    url = asset['browser_download_url']
    if not url.startswith(f'https://github.com/{REPO}/releases/download/{tag}/'):
        raise ValueError('Unexpected APK URL')
    asset_api_url = asset.get('url', '')
    if not re.fullmatch(rf'https://api\.github\.com/repos/{re.escape(REPO)}/releases/assets/[1-9][0-9]*', asset_api_url):
        raise ValueError('Unexpected GitHub asset API URL')
    if shutil.disk_usage(root).free < asset['size'] + 100 * 1024 * 1024:
        raise OSError('Insufficient space for APK and safety reserve')
    # Keep incomplete files outside the public web root.
    with tempfile.TemporaryDirectory(prefix='.sync-', dir=root.parent) as temporary:
        staging = Path(temporary)
        checksum = hashlib.sha256()
        size = 0
        with request(asset_api_url, accept='application/octet-stream') as response, (staging / name).open('wb') as target:
            while chunk := response.read(1024 * 1024):
                size += len(chunk)
                if size > asset['size']:
                    raise ValueError(f'{tag}: APK exceeds declared size')
                checksum.update(chunk)
                target.write(chunk)
        if size != asset['size'] or checksum.hexdigest() != digest[7:]:
            raise ValueError(f'{tag}: APK size or SHA-256 mismatch')
        metadata = {
            'version': APK_NAME.fullmatch(name).group(1),
            'release_id': release['id'],
            'name': name, 'size': size, 'sha256': checksum.hexdigest(),
            'download_url': f'/releases/{tag}/{name}',
            'github_url': url, 'release_url': release['html_url'],
            'published_at': release['published_at'],
        }
        write_json(staging / 'release.json', metadata)
        (staging / f'{name}.sha256').write_text(f'{checksum.hexdigest()}  {name}\n')
        staging.chmod(0o755)
        for file in staging.iterdir():
            file.chmod(0o644)
        staging.rename(destination)
    print(f'Mirrored {tag}: {name}', flush=True)
    return metadata


SCREENSHOTS = {
    'app-danmaku.png', 'app-fullscreen.png', 'app-search.png',
    'november-rain-danmaku.png', 'november-rain-fullscreen.png', 'november-rain-search.png',
}


def download_site_asset(asset, path):
    digest = asset.get('digest', '')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}', digest):
        raise ValueError('Website archive requires a GitHub SHA-256 digest')
    url = asset.get('url', '')
    if not re.fullmatch(rf'https://api\.github\.com/repos/{re.escape(REPO)}/releases/assets/[1-9][0-9]*', url):
        raise ValueError('Unexpected website asset API URL')
    if not 0 < asset['size'] <= 32 * 1024 * 1024:
        raise ValueError('Unexpected website archive size')
    checksum = hashlib.sha256()
    size = 0
    with request(url, accept='application/octet-stream') as response, path.open('wb') as output:
        while chunk := response.read(1024 * 1024):
            size += len(chunk)
            if size > asset['size']:
                raise ValueError('Website archive exceeds declared size')
            checksum.update(chunk)
            output.write(chunk)
    if size != asset['size'] or checksum.hexdigest() != digest[7:]:
        raise ValueError('Website archive size or SHA-256 mismatch')


def validate_site(site, version):
    manifest = json.loads((site / 'site-manifest.json').read_text())
    if manifest.get('schemaVersion') != 1 or manifest.get('appVersion') != version:
        raise ValueError('Website version does not match the APK')
    if manifest.get('screen') != {'width': 1080, 'height': 2340}:
        raise ValueError('Website screenshots must use portrait 19.5:9')
    if set(manifest.get('screenshots', {})) != SCREENSHOTS:
        raise ValueError('Website is missing release screenshots')
    files = manifest.get('files', {})
    if 'index.html' not in files:
        raise ValueError('Website manifest is missing index.html')
    for name, checksum in files.items():
        relative = PurePosixPath(name)
        if relative.is_absolute() or '..' in relative.parts:
            raise ValueError('Unsafe website file path')
        path = site / name
        if not path.is_file() or path.is_symlink():
            raise ValueError(f'Missing website file: {name}')
        with path.open('rb') as content:
            if hashlib.file_digest(content, 'sha256').hexdigest() != checksum:
                raise ValueError(f'Website file SHA-256 mismatch: {name}')
    for name in SCREENSHOTS:
        path = site / 'screenshots' / name
        data = path.read_bytes()
        if data[:8] != b'\x89PNG\r\n\x1a\n' or len(data) < 24 or struct.unpack('>II', data[16:24]) != (1080, 2340):
            raise ValueError(f'Invalid screenshot dimensions: {name}')
        if manifest['screenshots'][name]['sha256'] != hashlib.sha256(data).hexdigest() or f'screenshots/{name}' not in files:
            raise ValueError(f'Screenshot SHA-256 mismatch: {name}')
    return manifest


def prepare_site(root, release, metadata):
    name = f'MusicDan_{metadata["version"]}_website.tar.gz'
    candidates = [asset for asset in release['assets'] if asset['name'].endswith('_website.tar.gz')]
    if not candidates:
        return None  # Releases predating website bundles retain the installed site.
    if len(candidates) != 1 or candidates[0]['name'] != name:
        raise ValueError('Website archive name does not match the APK version')
    asset = candidates[0]
    tag = release['tag_name']
    if not SAFE_TAG.fullmatch(tag):
        raise ValueError('Unsafe website release tag')
    destination = root.parent / f'site-{tag}'
    if destination.exists():
        recorded = json.loads((destination / '.release-source.json').read_text())
        if recorded['digest'] != asset.get('digest'):
            raise ValueError('Website asset changed; refusing to overwrite')
        validate_site(destination, metadata['version'])
        return destination
    if shutil.disk_usage(root).free < asset['size'] + 164 * 1024 * 1024:
        raise OSError('Insufficient space for website archive and extraction')
    with tempfile.TemporaryDirectory(prefix='.site-sync-', dir=root.parent) as temporary:
        staging = Path(temporary)
        archive = staging / 'website.tar.gz'
        download_site_asset(asset, archive)
        site = staging / 'site'
        site.mkdir()
        with tarfile.open(archive, 'r:gz') as bundle:
            members = bundle.getmembers()
            if len(members) > 2000 or sum(member.size for member in members) > 64 * 1024 * 1024:
                raise ValueError('Website archive exceeds extraction limits')
            for member in members:
                path = PurePosixPath(member.name)
                if path.is_absolute() or '..' in path.parts or not (member.isfile() or member.isdir()):
                    raise ValueError('Unsafe website archive entry')
            bundle.extractall(site, members=members, filter='data')
        validate_site(site, metadata['version'])
        write_json(site / '.release-source.json', {'digest': asset['digest'], 'name': name, 'tag': tag})
        for entry in site.rglob('*'):
            entry.chmod(0o755 if entry.is_dir() else 0o644)
        site.chmod(0o755)
        site.rename(destination)
    print(f'Prepared website for {tag}', flush=True)
    return destination


def replace_link(path, target):
    temporary = path.with_name('.' + path.name + '-next')
    temporary.unlink(missing_ok=True)
    temporary.symlink_to(target)
    temporary.replace(path)


def sync(root):
    root.mkdir(parents=True, exist_ok=True)
    (root / 'releases').mkdir(exist_ok=True)
    with (root.parent / '.sync.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        latest = read_json(f'{API}/releases/latest')
        checkpoint = root.parent / '.sync-state.json'
        try:
            previous_latest_id = json.loads(checkpoint.read_text())['release_id']
        except FileNotFoundError:
            try:
                previous_latest_id = json.loads((root / 'latest' / 'release.json').read_text()).get('release_id', latest['id'])
            except FileNotFoundError:
                previous_latest_id = latest['id']
        pending = {latest['id']: latest}
        page = 1
        while True:
            releases = read_json(f'{API}/releases?per_page=100&page={page}')
            finished = False
            for release in releases:
                if release['id'] <= previous_latest_id:
                    finished = True
                    break
                if not release.get('draft') and not release.get('prerelease') and any(APK_NAME.fullmatch(asset['name']) for asset in release['assets']):
                    pending[release['id']] = release
            if finished or len(releases) < 100:
                break
            page += 1
        latest_site = None
        # Complete every build before moving the checkpoint, so failed intermediate
        # builds are retried even when the newest APK was already downloaded.
        for release in sorted(pending.values(), key=lambda release: release['id']):
            metadata = mirror_release(root, release)
            site = prepare_site(root, release, metadata)
            if release['id'] == latest['id']:
                latest_site = site
        history = [json.loads(path.read_text()) for path in (root / 'releases').glob('*/release.json')]
        history.sort(key=lambda release: release['published_at'], reverse=True)
        write_json(root / 'releases.json', history)
        if latest_site:
            replace_link(root.parent / 'site', latest_site.name)
        replace_link(root / 'latest', f'releases/{latest["tag_name"]}')
        write_json(checkpoint, {'release_id': latest['id']})
        print(f'Sync complete: {len(history)} releases; latest {latest["tag_name"]}', flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('/srv/musicdan/public'))
    arguments = parser.parse_args()
    sync(arguments.root)
