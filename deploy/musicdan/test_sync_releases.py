import copy
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('mirror', Path(__file__).with_name('sync-releases.py'))
mirror = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mirror)
PAYLOAD = b'verified APK fixture'


def release(tag='build-15', version='0.4.1'):
    name = f'MusicDan_{version}_arm64.apk'
    return {
        'id': 123456789,
        'tag_name': tag, 'draft': False, 'prerelease': False,
        'html_url': f'https://github.com/{mirror.REPO}/releases/tag/{tag}',
        'published_at': '2026-11-03T02:35:17Z',
        'assets': [{
            'name': name, 'size': len(PAYLOAD),
            'digest': f'sha256:{hashlib.sha256(PAYLOAD).hexdigest()}',
            'url': f'https://api.github.com/repos/{mirror.REPO}/releases/assets/123456789',
            'browser_download_url': f'https://github.com/{mirror.REPO}/releases/download/{tag}/{name}',
        }],
    }


class MirrorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / 'public'
        (self.root / 'releases').mkdir(parents=True)

    def download(self, data=PAYLOAD):
        return patch.object(mirror, 'request', side_effect=lambda *args, **kwargs: io.BytesIO(data))

    def test_verified_files_and_idempotency(self):
        with self.download():
            metadata = mirror.mirror_release(self.root, release())
        with patch.object(mirror, 'request', side_effect=AssertionError('should use cache')):
            self.assertEqual(mirror.mirror_release(self.root, release()), metadata)
        self.assertEqual((self.root / metadata['download_url'].lstrip('/')).read_bytes(), PAYLOAD)
        self.assertEqual(metadata['sha256'], hashlib.sha256(PAYLOAD).hexdigest())

    def test_failed_checksum_preserves_previous_latest(self):
        old = self.root / 'releases' / 'build-14'
        old.mkdir()
        (self.root / 'latest').symlink_to('releases/build-14')
        with self.download(b'x' * len(PAYLOAD)), patch.object(mirror, 'read_json', return_value=release()):
            with self.assertRaisesRegex(ValueError, 'mismatch'):
                mirror.sync(self.root)
        self.assertEqual((self.root / 'latest').resolve(), old)
        self.assertFalse((self.root / 'releases' / 'build-15').exists())
        self.assertEqual(list(self.root.parent.glob('.sync-*')), [])

    def test_cached_apk_tampering_and_asset_replacement_are_rejected(self):
        with self.download():
            metadata = mirror.mirror_release(self.root, release())
        changed = copy.deepcopy(release())
        changed['assets'][0]['digest'] = 'sha256:' + '0' * 64
        with self.assertRaisesRegex(ValueError, 'refusing to overwrite'):
            mirror.mirror_release(self.root, changed)
        (self.root / metadata['download_url'].lstrip('/')).write_bytes(b'corrupt')
        with self.assertRaisesRegex(ValueError, 'corrupt'):
            mirror.mirror_release(self.root, release())

    def test_unsafe_tags_missing_digest_and_unpublished_are_rejected(self):
        unsafe = release('../escape')
        with self.assertRaisesRegex(ValueError, 'Unsafe'):
            mirror.mirror_release(self.root, unsafe)
        missing = release()
        missing['assets'][0].pop('digest')
        with self.assertRaisesRegex(ValueError, 'digest'):
            mirror.mirror_release(self.root, missing)
        draft = release()
        draft['draft'] = True
        self.assertIsNone(mirror.mirror_release(self.root, draft))

    def test_all_builds_between_polls_are_mirrored_and_latest_is_atomic(self):
        newest, previous, baseline = release(), release('build-14', '0.4.0'), release('build-13', '0.3.9')
        previous['id'], baseline['id'] = 123456788, 123456787
        (self.root / 'releases' / 'build-13').mkdir()
        (self.root / 'releases' / 'build-13' / 'release.json').write_text(json.dumps({'release_id': baseline['id'], 'version': baseline['version'], 'published_at': baseline['published_at']}))
        (self.root / 'latest').symlink_to('releases/build-13')
        with self.download(), patch.object(mirror, 'read_json', side_effect=[newest, [newest, previous, baseline]]):
            mirror.sync(self.root)
        self.assertEqual((self.root / 'latest').resolve(), self.root / 'releases/build-15')
        history = json.loads((self.root / 'releases.json').read_text())
        self.assertEqual(len(history), 2)
        self.assertEqual(json.loads((self.root / 'latest/release.json').read_text())['version'], '0.4.1')


if __name__ == '__main__':
    unittest.main()
