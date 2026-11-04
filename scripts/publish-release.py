"""Verify staged artifacts, then switch the website/APK/metadata together under flock."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tarfile

BASE = Path('/srv/musicdan')
PUBLIC = BASE / 'public'
RELEASES = PUBLIC / 'releases'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def digest(file):
    with file.open('rb') as stream:
        checksum = hashlib.sha256()
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            checksum.update(chunk)
        return checksum.hexdigest()


def read_json(file):
    return json.loads(file.read_text())


def check_layout():
    # Refuse to rewrite a legacy layout implicitly during a release.
    for file, target in (
        (BASE / 'site', 'public/latest/site'),
        (PUBLIC / 'releases.json', 'latest/releases.json'),
        (RELEASES / 'latest.apk', '../latest/app.apk'),
        (RELEASES / 'latest.apk.sha256', '../latest/app.apk.sha256'),
    ):
        require(file.is_symlink() and os.readlink(file) == target,
                f'发布目录尚未采用统一 latest 指针，需先迁移：{file}')
    require((PUBLIC / 'latest').is_symlink(), 'latest 必须为符号链接')
    require((PUBLIC / 'latest').resolve().is_relative_to(PUBLIC), 'latest 超出 public 目录')
    require((PUBLIC / 'releases.json').is_file(), '缺少线上历史记录，禁止初始化覆盖')


def verify(directory):
    bundle = read_json(directory / 'bundle.json')
    entry = bundle['entry']
    plan = bundle['plan']
    number = plan['build_number']
    require(type(number) is int and 0 < number <= 1100000000, '构建编号无效')
    require(re.fullmatch(r'\d+\.\d+\.\d+', plan['version']), '版本格式无效')
    require(re.fullmatch(r'[a-f0-9]{40}', plan['source_commit']), '源码 SHA 无效')
    require(plan['version_code'] == 1000000000 + number, 'versionCode 不一致')
    for key in ('version', 'source_commit', 'build_number', 'version_code', 'published_at'):
        require(entry[key] == plan[key], f'元数据不一致：{key}')
    require(entry['name'] == f"MusicDan_{entry['version']}_arm64.apk", 'APK 名称不符')
    require(entry['tag'] == 'v' + entry['version'], 'tag 不符')
    require(bundle['site'] == f"MusicDan_{entry['version']}_website.tar.gz", '官网包名称不符')
    files = bundle['files']
    require(set(files) == {entry['name'], entry['name'] + '.sha256', bundle['site'],
                           'release-notes.md', 'release.json', 'releases.json'}, '附件集合不符')
    for name, checksum in files.items():
        require(Path(name).name == name and re.fullmatch(r'[a-f0-9]{64}', checksum), '附件格式无效')
        file = directory / name
        require(file.is_file() and not file.is_symlink(), f'附件不存在或为符号链接：{name}')
        require(digest(file) == checksum, f'附件校验失败：{name}')
    require(entry == read_json(directory / 'release.json'), 'release.json 不符')
    require(entry['sha256'] == files[entry['name']], 'APK 摘要不符')
    require(entry['size'] == (directory / entry['name']).stat().st_size, 'APK 大小不符')
    require(plan['notes_sha256'] == files['release-notes.md'], '更新日志摘要不符')
    require(entry['notes'] == (directory / 'release-notes.md').read_text(), '更新日志不符')
    history = read_json(directory / 'releases.json')
    require(isinstance(history, list) and 1 <= len(history) <= 3 and history[0] == entry, '发布记录无效')
    return bundle


def check_history(bundle):
    history_file = PUBLIC / 'releases.json'
    history = read_json(history_file)
    if history[0] == bundle['entry']:
        require(digest(history_file) == bundle['files']['releases.json'], '当前版本的历史记录不一致，拒绝覆盖')
        return True
    require(digest(history_file) == bundle['plan']['previous_sha256'], '服务器记录已变化，拒绝覆盖')
    return False


def verify_site(directory, bundle):
    manifest = read_json(directory / 'site/site-manifest.json')
    require(manifest['appVersion'] == bundle['entry']['version'], '官网版本不符')
    require(manifest['sourceCommit'] == bundle['entry']['source_commit'], '截图源码版本不符')
    require(manifest['screen'] == {'width': 1080, 'height': 2340}, '截图尺寸不符')
    require(manifest['files'], '官网文件清单为空')
    for name, checksum in manifest['files'].items():
        file = directory / 'site' / name
        require(not Path(name).is_absolute() and '..' not in Path(name).parts, '官网文件路径无效')
        require(file.is_file() and not file.is_symlink() and digest(file) == checksum, f'官网文件校验失败：{name}')
    require((directory / 'site/index.html').is_file(), '缺少官网入口')


def prune(history):
    protected = {(PUBLIC / 'latest').resolve(), (BASE / 'site').resolve()}
    keep_names = set()
    keep_builds = set()
    for entry in history:
        name = entry['name']
        require(re.fullmatch(r'MusicDan_\d+\.\d+\.\d+_arm64\.apk', name), '历史 APK 名称无效')
        number = entry.get('build_number')
        if number is None and type(entry.get('version_code')) is int:
            number = entry['version_code'] - 1000000000
        if number is None:
            match = re.search(r'/build-(\d+)(?:/|$)', entry.get('release_url') or entry.get('github_url', ''))
            require(match, '历史记录缺少编号，停止清理')
            number = int(match[1])
        require(type(number) is int and number > 0, '历史构建编号无效')
        directory = RELEASES / f'build-{number}'
        keep_builds.add(directory.name)
        keep_names.update((name, name + '.sha256'))
        apk = directory / name if directory.exists() else RELEASES / name
        require(apk.is_file(), f'保留版本缺少 APK：{apk}')
        protected.add(apk.resolve())
        if (directory / 'site').exists():
            protected.add((directory / 'site').resolve())

    candidates = [p for p in RELEASES.iterdir()
                  if ((re.fullmatch(r'build-\d+', p.name) and p.name not in keep_builds)
                      or (re.fullmatch(r'MusicDan_\d+\.\d+\.\d+_arm64\.apk(?:\.sha256)?', p.name)
                          and p.name not in keep_names))]
    candidates += list(BASE.glob('site-*'))
    candidates += [p for p in PUBLIC.iterdir()
                   if p.name == '.latest-legacy' or re.fullmatch(r'\.latest-before-\d+', p.name)]
    for candidate in candidates:
        resolved = candidate.resolve()
        if any(resolved == item or resolved in item.parents for item in protected):
            continue
        # An unpublished stage may belong to another in-flight release.
        if candidate.is_dir() and (candidate / 'bundle.json').is_file():
            pending = read_json(candidate / 'bundle.json')['entry']['build_number']
            if pending >= history[0]['build_number']:
                continue
        if candidate.is_symlink() or candidate.is_file():
            candidate.unlink()
        elif candidate.is_dir():
            shutil.rmtree(candidate)


action, argument = sys.argv[1:]
require(action in ('check', 'stage', 'activate'), '未知操作')
with (BASE / '.publish.lock').open('a') as lock:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    check_layout()
    if action == 'check':
        print('统一发布目录检查通过')
    else:
        directory = Path(argument)
        require(not directory.is_symlink(), '禁止通过符号链接读取暂存目录')
        if action == 'stage':
            require(directory.parent == BASE and re.fullmatch(r'\.upload-[a-f0-9-]+', directory.name), '暂存路径无效')
        else:
            require(directory.parent == RELEASES and re.fullmatch(r'build-\d+', directory.name), '发布路径无效')
        bundle = verify(directory)
        check_history(bundle)
        destination = RELEASES / f"build-{bundle['plan']['build_number']}"
        if action == 'stage':
            if destination.exists():
                require(not destination.is_symlink(), '发布目录不能为符号链接')
                require(verify(destination) == bundle, '已有构建目录内容不同，禁止覆盖')
                verify_site(destination, bundle)
                shutil.rmtree(directory)
            else:
                with tarfile.open(directory / bundle['site']) as archive:
                    for member in archive.getmembers():
                        require(not Path(member.name).is_absolute() and '..' not in Path(member.name).parts,
                                '官网压缩包路径无效')
                        require(member.isfile() or member.isdir(), '官网压缩包不允许链接或设备')
                    site = directory / 'site'
                    require(not site.exists(), '暂存目录已有官网文件')
                    site.mkdir()
                    for member in archive.getmembers():
                        target = site / member.name
                        if member.isdir():
                            target.mkdir(parents=True, exist_ok=True)
                        else:
                            target.parent.mkdir(parents=True, exist_ok=True)
                            with archive.extractfile(member) as source, target.open('xb') as output:
                                shutil.copyfileobj(source, output)
                verify_site(directory, bundle)
                (directory / 'app.apk').symlink_to(bundle['entry']['name'])
                (directory / 'app.apk.sha256').symlink_to(bundle['entry']['name'] + '.sha256')
                for file in [directory, *directory.rglob('*')]:
                    if not file.is_symlink():
                        file.chmod(0o755 if file.is_dir() else 0o644)
                directory.rename(destination)
            print(f'服务器产物已校验并暂存：{destination}')
        else:
            require(directory == destination, '发布目录编号不符')
            verify_site(directory, bundle)
            for link, target in (('app.apk', bundle['entry']['name']),
                                 ('app.apk.sha256', bundle['entry']['name'] + '.sha256')):
                require((directory / link).is_symlink() and os.readlink(directory / link) == target,
                        f'版本目录下载链接不符：{link}')
            for name in (bundle['entry']['name'], bundle['entry']['name'] + '.sha256'):
                alias = RELEASES / name
                if alias.exists() or alias.is_symlink():
                    require(alias.resolve() == (directory / name).resolve(), '历史下载链接冲突，禁止覆盖')
                else:
                    alias.symlink_to(f'{directory.name}/{name}')
            temporary = PUBLIC / f'.latest-{os.getpid()}'
            temporary.symlink_to(f'releases/{destination.name}')
            os.replace(temporary, PUBLIC / 'latest')
            prune(read_json(directory / 'releases.json'))
            print(f"官网、APK、更新日志已切换到 {bundle['entry']['tag']}")
