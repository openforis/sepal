import os
from pathlib import Path
import subprocess
import sys
import tempfile
import shutil
import select
import signal
import unittest
from datetime import datetime, timezone
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'script'))
from registry_cleanup import CleanupError
from registry_maintenance import GitTags, MAINTENANCE, protect_run, recover


class CoordinationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.repo = self.root / 'checkout'
        self.repo.mkdir()
        self.git_command('init', '--bare', '--quiet', str(self.root / 'origin'))
        self.git_command('init', '--quiet', str(self.repo))
        self.git_command('config', 'user.name', 'Fixture')
        self.git_command('config', 'user.email', 'fixture@example.invalid')
        self.git_command('remote', 'add', 'origin', str(self.root / 'origin'))
        script = self.repo / 'modules/ops/script/build-and-push-images.sh'
        script.parent.mkdir(parents=True)
        script.write_text('push gui\npush gateway\n')
        self.git_command('add', '.')
        self.git_command('commit', '--quiet', '-m', 'fixture')
        self.sha = self.git_command('rev-parse', 'HEAD').strip()
        self.git_command('push', '--quiet', 'origin', 'HEAD:refs/tags/build-2')
        self.tags = GitTags(self.repo)
        self.ran = self.root / 'ran'
        self.command = [sys.executable, '-c', f'from pathlib import Path; Path({str(self.ran)!r}).touch()']

    def git_command(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.PIPE, text=True)

    def test_a_successful_deploy_records_before_releasing_protection(self):
        self.assertEqual(protect_run(self.tags, 'prod', '2', True, self.command), 0)
        refs = self.tags.read()
        self.assertTrue(self.ran.exists())
        self.assertTrue(any(t.startswith('deployed/prod/') and t.endswith('/2') for t in refs))
        self.assertFalse(any(t.startswith('deploying/') for t in refs))

    def test_a_pull_only_success_releases_its_marker_without_recording_a_deployment(self):
        self.assertEqual(protect_run(self.tags, 'test', '2', False, self.command), 0)
        self.assertEqual(self.tags.read(), {'build-2': self.sha})

    def test_consumers_at_the_same_instant_keep_independent_protection(self):
        fixed = datetime(2026, 11, 23, tzinfo=timezone.utc)

        def run(command, env):
            if command == ['held-consumer']:
                held = {t for t in self.tags.read() if t.startswith('deploying/')}
                self.assertEqual(protect_run(self.tags, 'test', '2', False, ['true']), 0)
                self.assertEqual({t for t in self.tags.read() if t.startswith('deploying/')}, held)
                return 0
            return subprocess.run(command, env=env).returncode

        with patch('registry_maintenance.datetime') as clock, patch('registry_maintenance.child', side_effect=run):
            clock.now.return_value = fixed
            self.assertEqual(protect_run(self.tags, 'test', '2', False, ['held-consumer']), 0)

    def test_waits_for_the_remote_build_tag_before_acquiring_protection(self):
        def publish(_seconds):
            self.assertFalse(any(t.startswith('deploying/') for t in self.tags.read()))
            self.tags.create('build-999', self.sha)

        with patch('registry_maintenance.time.sleep', side_effect=publish):
            self.assertEqual(protect_run(self.tags, 'test', '999', False, self.command, wait=True), 0)
        self.assertTrue(self.ran.exists())

    def test_failed_child_leaves_its_marker(self):
        self.assertEqual(protect_run(self.tags, 'prod', '2', True, ['sh', '-c', 'exit 7']), 7)
        self.assertTrue(any(t.startswith('deploying/') for t in self.tags.read()))

    def test_even_an_old_cleanup_marker_blocks_and_no_pull_starts(self):
        self.tags.create(MAINTENANCE, self.sha)
        with self.assertRaises(CleanupError):
            protect_run(self.tags, 'prod', '2', True, self.command)
        self.assertFalse(self.ran.exists())
        self.assertEqual(self.tags.read(), {'build-2': self.sha, MAINTENANCE: self.sha})

    def test_an_ambiguous_recording_failure_keeps_protection(self):
        # A real tag write whose response is then lost, through the adapter's public seam.
        original = self.tags.create

        def create(name, commit):
            original(name, commit)
            if name.startswith('deployed/'):
                raise CleanupError('lost push response')

        self.tags.create = create
        with self.assertRaises(CleanupError):
            protect_run(self.tags, 'prod', '2', True, self.command)
        self.assertTrue(any(t.startswith('deploying/') for t in self.tags.read()))

    def test_missing_remote_stops_before_the_child(self):
        self.git_command('remote', 'set-url', 'origin', str(self.root / 'missing'))
        with self.assertRaises(CleanupError):
            protect_run(self.tags, 'prod', '2', True, self.command)
        self.assertFalse(self.ran.exists())

    def test_cleanup_starting_during_the_deploys_read_cannot_also_proceed(self):
        read = self.tags.read
        reads = 0
        cleanup_running = []

        def read_with_cleanup():
            nonlocal reads
            snapshot = read()
            reads += 1
            if reads == 2:
                other = GitTags(self.repo)
                other.create(MAINTENANCE, self.sha)
                if any(t.startswith('deploying/') for t in other.read()):
                    other.remove(MAINTENANCE)
                else:
                    cleanup_running.append(True)
            return snapshot

        self.tags.read = read_with_cleanup
        self.assertEqual(protect_run(self.tags, 'prod', '2', False, self.command), 0)
        self.assertFalse(cleanup_running, 'cleanup and a pull must not both pass their handshake')

    def test_failed_cleanup_marker_read_stops_before_pulling(self):
        read = self.tags.read
        reads = 0

        def failing_read():
            nonlocal reads
            reads += 1
            if reads == 2:
                raise CleanupError('transient marker read failure')
            return read()

        self.tags.read = failing_read
        with self.assertRaises(CleanupError):
            protect_run(self.tags, 'test', '2', False, self.command)
        self.assertFalse(self.ran.exists())

    def test_lost_start_marker_reply_does_not_start_the_child(self):
        create = self.tags.create

        def failed_reply(name, commit):
            create(name, commit)
            raise CleanupError('lost start-marker reply')

        self.tags.create = failed_reply
        with self.assertRaises(CleanupError):
            protect_run(self.tags, 'test', '2', False, self.command)
        self.assertFalse(self.ran.exists())
        self.assertTrue(any(t.startswith('deploying/') for t in self.tags.read()))

    def test_reads_expected_images_from_the_builds_own_commit(self):
        (self.repo / 'modules/ops/script/build-and-push-images.sh').write_text('push completely-different\n')
        self.git_command('add', '.')
        self.git_command('commit', '--quiet', '-m', 'new push list')
        self.assertEqual(self.tags.repositories(self.sha), ['openforis/gui', 'openforis/gateway'])

    def test_annotated_build_tags_resolve_to_the_commit(self):
        self.git_command('tag', '-a', '-m', 'fixture', 'build-10')
        self.git_command('push', '--quiet', 'origin', 'refs/tags/build-10')
        self.assertEqual(self.tags.read()['build-10'], self.sha)

    def test_the_actual_deploy_launcher_guards_an_older_pinned_script(self):
        source = Path(__file__).resolve().parents[3]
        old = self.repo / 'bin/deploy'
        old.parent.mkdir()
        old.write_text('#!/bin/bash\ngit ls-remote --tags origin > "$GUARD_PROOF"\nprintf "%s\\n" "$@" > "$GUARD_ARGS"\n')
        old.chmod(0o755)
        self.git_command('add', '.')
        self.git_command('commit', '--quiet', '-m', 'older deploy')
        self.git_command('push', '--quiet', '--force', 'origin', 'HEAD:refs/tags/build-2')
        shutil.copyfile(source / 'bin/deploy', old)
        for name in ('registry_cleanup.py', 'registry_maintenance.py'):
            shutil.copyfile(source / 'modules/ops/script' / name, self.repo / 'modules/ops/script' / name)
        config = self.root / 'config'
        config.mkdir()
        (config / 'env').write_text('DEPLOY_ENVIRONMENT=UAT\n')
        tmp = self.root / 'tmp'
        tmp.mkdir()
        proof, args = self.root / 'proof', self.root / 'args'
        env = {k: v for k, v in os.environ.items() if k not in ('GIT_COMMIT', 'SEPAL_REGISTRY_GUARDED')}
        env.update(TMPDIR=str(tmp), GUARD_PROOF=str(proof), GUARD_ARGS=str(args))
        result = subprocess.run([str(old), '-b', '2', '-c', str(config), '-s', 'aws/sepal/deploy.sh'],
            env=env, cwd=self.repo, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('refs/tags/deploying/test/', proof.read_text())
        self.assertIn('--local', args.read_text())
        refs = self.tags.read()
        self.assertFalse(any(t.startswith('deploying/') for t in refs))
        self.assertTrue(any(t.startswith('deployed/test/') for t in refs))

    def test_actual_deploy_waits_without_protection_for_an_unpublished_build(self):
        source = Path(__file__).resolve().parents[3]
        launcher = self.repo / 'bin/deploy'
        launcher.parent.mkdir()
        shutil.copy2(source / 'bin/deploy', launcher)
        for name in ('registry_cleanup.py', 'registry_maintenance.py'):
            shutil.copyfile(source / 'modules/ops/script' / name, self.repo / 'modules/ops/script' / name)
        config = self.root / 'config'
        config.mkdir()
        (config / 'env').write_text('DEPLOY_ENVIRONMENT=UAT\n')
        env = {k: v for k, v in os.environ.items() if k not in ('GIT_COMMIT', 'SEPAL_REGISTRY_GUARDED')}
        process = subprocess.Popen([str(launcher), '--wait', '-b', '999', '-c', str(config),
            '-s', 'aws/sepal/deploy.sh'], env=env, cwd=self.repo, stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT, start_new_session=True)
        try:
            self.assertTrue(select.select([process.stdout], [], [], 5)[0], 'no wait message')
            output = os.read(process.stdout.fileno(), 4096)
            self.assertIn(b'Waiting for build 999', output)
            self.assertIsNone(process.poll())
            self.assertFalse(any(t.startswith('deploying/') for t in self.tags.read()))
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGTERM)
            process.communicate(timeout=10)

    def test_recovery_stops_gc_before_restarting_and_clears_the_marker_last(self):
        self.tags.create(MAINTENANCE, self.sha)
        host = HostFixture()
        recover(self.tags, host)
        self.assertTrue(host.healthy)
        self.assertFalse(host.gc)
        self.assertNotIn(MAINTENANCE, self.tags.read())

    def test_failed_health_check_keeps_the_marker(self):
        self.tags.create(MAINTENANCE, self.sha)
        host = HostFixture()
        host.fail_health = True
        with self.assertRaises(CleanupError):
            recover(self.tags, host)
        self.assertIn(MAINTENANCE, self.tags.read())

    def test_failed_cache_reset_removal_stops_recovery_and_keeps_the_marker(self):
        self.tags.create(MAINTENANCE, self.sha)
        host = HostFixture()
        host.fail_cache_reset = True
        with self.assertRaisesRegex(CleanupError, 'cache reset'):
            recover(self.tags, host)
        self.assertFalse(host.started)
        self.assertIn(MAINTENANCE, self.tags.read())


class HostFixture:
    def __init__(self):
        self.gc = True
        self.started = False
        self.healthy = False
        self.fail_health = False
        self.cache_reset = True
        self.fail_cache_reset = False

    def remove_cache_reset(self):
        if self.fail_cache_reset:
            raise CleanupError('cannot remove cache reset')
        self.cache_reset = False

    def gc_exists(self):
        return self.gc

    def remove_gc(self):
        self.gc = False

    def running(self):
        return self.started

    def start(self):
        assert not self.cache_reset, 'recovery must stop cache deletion before starting services'
        assert not self.gc, 'registry may not start while GC exists'
        self.started = True

    def wait_ready(self):
        assert self.started
        if self.fail_health:
            raise CleanupError('not healthy')
        self.healthy = True
