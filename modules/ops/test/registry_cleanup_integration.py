"""Run via registry-cleanup.test.sh, never against the host's Docker daemon."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'script'))
from registry_cleanup import CleanupError, Registry
from registry_maintenance import GitTags, MAINTENANCE


@unittest.skipUnless(os.environ.get('OPS_REGISTRY_FIXTURE') == '1', 'requires the private Docker fixture')
class RegistryIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.source = Path(__file__).resolve().parents[3]
        cls.temp = tempfile.TemporaryDirectory()
        cls.root = Path(cls.temp.name)
        for _ in range(100):
            if subprocess.run(['docker', 'version'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(0.2)
        cls.repo = cls.root / 'checkout'
        cls.repo.mkdir()
        cls.cmd('git', 'init', '--bare', '--quiet', str(cls.root / 'origin'))
        cls.cmd('git', '-C', str(cls.repo), 'init', '--quiet')
        cls.git('config', 'user.name', 'Fixture')
        cls.git('config', 'user.email', 'fixture@example.invalid')
        cls.git('remote', 'add', 'origin', str(cls.root / 'origin'))
        script = cls.repo / 'modules/ops/script/build-and-push-images.sh'
        script.parent.mkdir(parents=True)
        script.write_text('push fixture\n')
        cls.git('add', '.')
        cls.git('commit', '--quiet', '-m', 'fixture')
        cls.sha = cls.git('rev-parse', 'HEAD')
        cls.tags = GitTags(cls.repo)
        cls.env = dict(os.environ, WORKSPACE=str(cls.repo), JENKINS_HOME=str(cls.root / 'jenkins'),
            REGISTRY_API_URL='http://localhost:5000', DRY_RUN='false')
        cls.registry = Registry(cls.env['REGISTRY_API_URL'])
        context = cls.root / 'registry'
        context.mkdir()
        shutil.copyfile(cls.source / 'modules/ops/registry.yml', context / 'config.yml')
        (context / 'registry').write_text('#!/bin/sh\nif [ "$1" = garbage-collect ] && [ -f /var/lib/registry/hold ]; then\n'
            'touch /var/lib/registry/gc-started\nwhile [ -f /var/lib/registry/hold ]; do sleep 1; done\nfi\nexec /bin/registry-real "$@"\n')
        (context / 'Dockerfile').write_text('FROM registry:3\nRUN mv /bin/registry /bin/registry-real\n'
            'COPY registry /bin/registry\nRUN chmod +x /bin/registry\nCOPY config.yml /etc/distribution/config.yml\n')
        cls.cmd('docker', 'build', '--quiet', '-t', 'fixture-registry', str(context))
        cls.cmd('docker', 'run', '--detach', '--name', 'docker-registry', '--publish', '127.0.0.1:5000:5000',
            '--volume', 'fixture-registry:/var/lib/registry', 'fixture-registry')
        cls.wait(lambda: cls.ready())
        image = cls.root / 'image'
        image.mkdir()
        (image / 'Dockerfile').write_text('FROM scratch\nCOPY content /content\n')
        cls.images = []
        for number in range(3):
            (image / 'content').write_bytes(os.urandom(256 * 1024))
            ref = f'localhost:5000/openforis/fixture:temporary{number}'
            cls.cmd('docker', 'build', '--quiet', '--provenance=false', '-t', ref, str(image))
            cls.cmd('docker', 'push', '--quiet', ref)
            cls.images.append(cls.registry.manifest('openforis/fixture', 'temporary' + str(number))[0])
        for build in ('0', '00', '1', '2', '3', '1-test', '2-test'):
            cls.tags.create('build-' + build, cls.sha)
        for tag in ('00', '2', '3', '1-test', '2-test'):
            cls.tag_manifest(tag, cls.images[0])
        cls.index('1', [cls.images[0], cls.images[1]])
        cls.index('0', [cls.images[2]])
        for number in range(3):
            cls.registry.delete('openforis/fixture', 'temporary' + str(number))
        for env, builds in (('prod', ('1', '2')), ('test', ('1-test', '2-test'))):
            for day, build in enumerate(builds, 1):
                cls.tags.create(f'deployed/{env}/2026110{day}T000000Z/{build}', cls.sha)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    @classmethod
    def cmd(cls, *args):
        result = subprocess.run(args, capture_output=True, text=True)
        if result.returncode:
            raise AssertionError(f'{args[0:2]}: {result.stderr}')
        return result.stdout.strip()

    @classmethod
    def git(cls, *args):
        return cls.cmd('git', '-C', str(cls.repo), *args)

    @classmethod
    def ready(cls):
        try:
            cls.registry.ready()
            return True
        except CleanupError:
            return False

    @classmethod
    def wait(cls, condition):
        deadline = time.monotonic() + 60
        while not condition():
            if time.monotonic() > deadline:
                raise AssertionError('fixture did not reach the expected state')
            time.sleep(0.1)

    @classmethod
    def tag_manifest(cls, tag, digest):
        base = cls.registry.url + 'v2/openforis/fixture/manifests/'
        with urlopen(Request(base + digest, headers={'Accept': 'application/vnd.docker.distribution.manifest.v2+json'})) as response:
            data, media = response.read(), response.headers['Content-Type']
        with urlopen(Request(base + tag, data=data, method='PUT', headers={'Content-Type': media})) as response:
            assert response.status == 201

    @classmethod
    def index(cls, tag, digests):
        manifests = []
        for i, digest in enumerate(digests):
            with urlopen(Request(cls.registry.url + 'v2/openforis/fixture/manifests/' + digest,
                    headers={'Accept': 'application/vnd.docker.distribution.manifest.v2+json'})) as response:
                manifests.append({'digest': digest, 'size': len(response.read()), 'mediaType': response.headers['Content-Type'],
                    'platform': {'os': 'linux', 'architecture': 'amd64' if i == 0 else 'arm64'}})
        data = json.dumps({'schemaVersion': 2, 'mediaType': 'application/vnd.oci.image.index.v1+json', 'manifests': manifests}).encode()
        with urlopen(Request(cls.registry.url + 'v2/openforis/fixture/manifests/' + tag, data=data, method='PUT',
                headers={'Content-Type': 'application/vnd.oci.image.index.v1+json'})) as response:
            assert response.status == 201

    def operation(self, *args, env=None):
        return subprocess.run([sys.executable, str(self.source / 'modules/ops/script/registry_maintenance.py'), *args],
            env=self.env if env is None else env, capture_output=True, text=True, timeout=90)

    def test_01_dry_run_keeps_all_images_and_restores_its_marker(self):
        result = self.operation('cleanup', '--dry-run')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('Would delete', result.stdout)
        self.assertIsNotNone(self.registry.manifest('openforis/fixture', '0'))
        self.assertNotIn(MAINTENANCE, self.tags.read())

    def test_02_apply_preserves_pullable_indexes_and_reclaims_unprotected_data(self):
        before = int(self.cmd('docker', 'exec', 'docker-registry', 'du', '-sk', '/var/lib/registry').split()[0])
        result = self.operation('cleanup')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIsNone(self.registry.manifest('openforis/fixture', '0'))
        self.assertIsNone(self.registry.manifest('openforis/fixture', '00'))
        self.assertIsNone(self.registry.manifest('openforis/fixture', self.images[2]))
        self.assertIsNotNone(self.registry.manifest('openforis/fixture', self.images[1]))
        for tag in ('1', '2', '1-test', '2-test'):
            self.cmd('docker', 'pull', '--quiet', 'localhost:5000/openforis/fixture:' + tag)
        after = int(self.cmd('docker', 'exec', 'docker-registry', 'du', '-sk', '/var/lib/registry').split()[0])
        self.assertLess(after, before)
        self.assertNotIn(MAINTENANCE, self.tags.read())

    def test_03_cancellation_removes_gc_before_registry_returns(self):
        self.interrupt_gc(signal.SIGTERM)
        self.assertTrue(self.ready())
        self.assertNotIn(MAINTENANCE, self.tags.read())

    def test_04_a_killed_cleanup_is_recovered_before_an_old_branch_build(self):
        self.interrupt_gc(signal.SIGKILL)
        self.assertFalse(self.ready())
        self.assertIn(MAINTENANCE, self.tags.read())
        result = self.operation('build', '--', 'sh', '-c', 'echo recovered-old-build')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn('recovered-old-build', result.stdout)
        self.assertTrue(self.ready())
        self.assertNotIn(MAINTENANCE, self.tags.read())
        self.cmd('docker', 'exec', 'docker-registry', 'rm', '-f', '/var/lib/registry/hold', '/var/lib/registry/gc-started')

    def test_05_startup_recovery_can_clear_a_marker_without_a_workspace(self):
        self.interrupt_gc(signal.SIGKILL)
        job = Path(self.env['JENKINS_HOME']) / 'jobs/Sepal/config.xml'
        job.parent.mkdir(parents=True)
        job.write_text('<project><scm><hudson.plugins.git.UserRemoteConfig><url>' + str(self.root / 'origin')
            + '</url></hudson.plugins.git.UserRemoteConfig></scm></project>')
        result = self.operation('recover')
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertTrue(self.ready())
        self.assertNotIn(MAINTENANCE, self.tags.read())
        self.cmd('docker', 'exec', 'docker-registry', 'rm', '-f', '/var/lib/registry/hold', '/var/lib/registry/gc-started')

    def test_06_build_holds_the_real_lock_while_its_child_is_running(self):
        notice = self.root / 'child-started'
        code = f'from pathlib import Path; import sys; Path({str(notice)!r}).touch(); sys.stdin.read(1)'
        process = subprocess.Popen([sys.executable, str(self.source / 'modules/ops/script/registry_maintenance.py'),
            'build', '--', sys.executable, '-c', code], env=self.env,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            self.wait(notice.exists)
            with (Path(self.env['JENKINS_HOME']) / 'registry.lock').open('a') as lock:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            out, err = process.communicate(b'x', timeout=10)
            self.assertEqual(process.returncode, 0, out + err)
        finally:
            if process.poll() is None:
                process.kill()
                process.communicate()

    def test_07_an_old_deployment_marker_skips_cleanup_without_stopping_pulls(self):
        marker = 'deploying/test/20200101T000000Z/2'
        self.tags.create(marker, self.sha)
        started = self.cmd('docker', 'inspect', '--format', '{{.State.StartedAt}}', 'docker-registry')
        try:
            result = self.operation('cleanup')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('possibly abandoned', result.stdout)
            self.assertIn(marker, self.tags.read())
            self.assertNotIn(MAINTENANCE, self.tags.read())
            self.assertEqual(self.cmd('docker', 'inspect', '--format', '{{.State.StartedAt}}', 'docker-registry'), started)
        finally:
            self.tags.remove(marker)

    def test_08_missing_deployment_images_force_dry_run_even_when_apply_is_requested(self):
        self.registry.delete('openforis/fixture', '2')
        started = self.cmd('docker', 'inspect', '--format', '{{.State.StartedAt}}', 'docker-registry')
        try:
            result = self.operation('cleanup')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIn('DRY RUN: prod needs', result.stdout)
            self.assertEqual(self.cmd('docker', 'inspect', '--format', '{{.State.StartedAt}}', 'docker-registry'), started)
        finally:
            self.tag_manifest('2', self.images[0])

    def test_09_same_timestamp_consumers_cannot_release_each_others_image(self):
        old = self.registry.manifest('openforis/fixture', '0')
        if old:
            self.registry.delete('openforis/fixture', old[0])
        self.cmd('docker', 'tag', 'localhost:5000/openforis/fixture:temporary2', 'localhost:5000/openforis/fixture:0')
        self.cmd('docker', 'push', '--quiet', 'localhost:5000/openforis/fixture:0')
        consumer = self.root / 'frozen-consumer.py'
        consumer.write_text('import sys\nfrom datetime import datetime, timezone\nfrom unittest.mock import patch\n'
            f'sys.path.insert(0, {str(self.source / "modules/ops/script")!r})\n'
            'import registry_maintenance as maintenance\n'
            'with patch.object(maintenance, "datetime") as clock:\n'
            '    clock.now.return_value = datetime(2026, 11, 23, tzinfo=timezone.utc)\n'
            '    status = maintenance.protect_run(maintenance.GitTags(sys.argv[1]), "test", "0", False, sys.argv[2:])\n'
            'sys.exit(status)\n')
        notice = self.root / 'consumer-started'
        command = f'from pathlib import Path; import sys; Path({str(notice)!r}).touch(); sys.stdin.read(1)'
        first = subprocess.Popen([sys.executable, str(consumer), str(self.repo), sys.executable, '-c', command],
            env=self.env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        try:
            self.wait(notice.exists)
            second = subprocess.run([sys.executable, str(consumer), str(self.repo), 'true'],
                env=self.env, capture_output=True, timeout=15)
            self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
            result = self.operation('cleanup')
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertIsNotNone(self.registry.manifest('openforis/fixture', '0'), 'running consumer image was deleted')
            self.assertIn('Cleanup skipped', result.stdout)
            self.assertIsNone(first.poll(), 'first consumer must still be active')
        finally:
            out, err = first.communicate(b'x', timeout=15)
            self.assertEqual(first.returncode, 0, out + err)

    def test_10_a_force_killed_cache_reset_cannot_delete_the_next_builds_packages(self):
        checkout, env = self.cache_reset_fixture()
        script = checkout / 'modules/ops/script/build-and-push-images.sh'
        image = 'localhost:5000/openforis/r-proxy:10-weekly'
        process = subprocess.Popen([str(script), '10-weekly', '--clean'], env=env,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
        deletion = []

        def deleting():
            for container in self.cmd('docker', 'ps', '--quiet', '--filter', 'ancestor=' + image).splitlines():
                if subprocess.run(['docker', 'exec', container, 'test', '-f', '/R/.deletion-started'],
                        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                    deletion.append(container)
                    return True
            return False

        try:
            self.wait(deleting)
            os.killpg(process.pid, signal.SIGKILL)
            out, err = process.communicate(timeout=10)
            self.assertEqual(process.returncode, -signal.SIGKILL, out + err)
            self.assertEqual(self.cmd('docker', 'inspect', '--format', '{{.State.Running}}', deletion[0]), 'true')

            # An older branch also restarts these services, through the image-baked launcher.
            script.write_text('#!/bin/bash\nset -e\n'
                'docker compose --file "$WORKSPACE/modules/r-proxy/docker-compose.yml" up --detach --wait\n'
                'docker exec r-proxy sh -c "echo replacement > /R/new-package"\n')
            result = subprocess.run(['/usr/local/bin/sepal-build', '11-hotfix'],
                env=env, capture_output=True, text=True, timeout=30)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

            if self.cmd('docker', 'ps', '--quiet', '--filter', 'id=' + deletion[0]):
                self.cmd('docker', 'exec', 'r-proxy', 'sh', '-c', 'echo continue > /R/.deletion-release')
                self.wait(lambda: not self.cmd('docker', 'ps', '--all', '--quiet', '--filter', 'id=' + deletion[0]))
            self.assertEqual(self.cmd('docker', 'exec', 'r-proxy', 'cat', '/R/new-package'), 'replacement')
            self.assertEqual(self.cmd('docker', 'ps', '--all', '--quiet', '--filter', 'id=' + deletion[0]), '')
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
            subprocess.run(['docker', 'rm', '--force', *deletion, 'r-proxy', 'r-proxy-redis', 'logger'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def test_11_recovery_refuses_an_unowned_container_with_the_cache_reset_name(self):
        self.cmd('docker', 'run', '--detach', '--name', 'sepal-r-cache-reset', '--entrypoint', 'sh',
            'fixture-registry', '-c', 'sleep 3600')
        notice = self.root / 'unprotected-build-started'
        try:
            result = self.operation('build', '--', 'touch', str(notice))
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('refusing to remove', result.stderr)
            self.assertFalse(notice.exists())
            self.assertEqual(self.cmd('docker', 'inspect', '--format', '{{.State.Running}}', 'sepal-r-cache-reset'), 'true')
        finally:
            self.cmd('docker', 'rm', '--force', 'sepal-r-cache-reset')

    def cache_reset_fixture(self):
        checkout = self.root / 'cache-build'
        script = checkout / 'modules/ops/script/build-and-push-images.sh'
        script.parent.mkdir(parents=True)
        shutil.copy2(self.source / 'modules/ops/script/build-and-push-images.sh', script)
        (checkout / 'ci').mkdir()
        for name in ('console.sh', 'console.py'):
            shutil.copy2(self.source / 'ci' / name, checkout / 'ci' / name)
        helper = checkout / 'ci/test-images.sh'
        helper.write_text('#!/bin/sh\nexit 0\n')
        helper.chmod(0o755)
        self.cmd('git', '-C', str(checkout), 'init', '--quiet')
        self.cmd('git', '-C', str(checkout), 'remote', 'add', 'origin', str(self.root / 'origin'))

        context = self.root / 'cache-image'
        context.mkdir()
        (context / 'find').write_text('#!/bin/sh\ntouch /R/.deletion-started\n'
            'read -r release < /R/.deletion-release\nexec /usr/bin/find "$@"\n')
        (context / 'Dockerfile').write_text('FROM alpine:3\nCOPY find /usr/local/bin/find\n'
            'RUN chmod +x /usr/local/bin/find\n')
        self.cmd('docker', 'build', '--quiet', '-t', 'localhost:5000/openforis/r-proxy:10-weekly', str(context))
        for module in ('logger', 'sandbox-base', 'r-proxy'):
            (checkout / 'modules' / module).mkdir()
        (checkout / 'modules/logger/docker-compose.yml').write_text('services:\n  logger:\n'
            '    image: alpine:3\n    container_name: logger\n    command: [sleep, "3600"]\n')
        (checkout / 'modules/r-proxy/docker-compose.yml').write_text('services:\n  r-proxy:\n'
            '    image: localhost:5000/openforis/r-proxy:10-weekly\n    container_name: r-proxy\n'
            '    command: [sleep, "3600"]\n    volumes:\n'
            '      - /data/r-proxy/repo:/R\n      - /data/r-proxy/site-library:/usr/local/lib/R/site-library\n'
            '  r-proxy-redis:\n    image: alpine:3\n    container_name: r-proxy-redis\n'
            '    command: [sleep, "3600"]\n    volumes:\n      - /data/r-proxy-redis:/data\n')
        self.cmd('docker', 'run', '--rm', '--volume', '/data:/data', 'alpine:3', 'sh', '-c',
            'mkdir -p /data/r-proxy/repo /data/r-proxy/site-library /data/r-proxy-redis; '
            'mkfifo /data/r-proxy/repo/.deletion-release; echo old > /data/r-proxy/repo/old-package')

        binary = checkout / 'bin'
        binary.mkdir()
        docker = binary / 'docker'
        docker.write_text('#!/bin/sh\ncase " $* " in *" build "*) exit 0 ;; esac\n'
            f'exec {shutil.which("docker")} "$@"\n')
        docker.chmod(0o755)
        env = dict(self.env, WORKSPACE=str(checkout), PATH=str(binary) + os.pathsep + os.environ['PATH'],
            SKIP_TESTS='true', DOCKER_REGISTRY_HOST='localhost:5000', GIT_COMMIT=self.sha)
        return checkout, env

    def interrupt_gc(self, signum):
        self.cmd('docker', 'exec', 'docker-registry', 'touch', '/var/lib/registry/hold')
        process = subprocess.Popen([sys.executable, str(self.source / 'modules/ops/script/registry_maintenance.py'), 'cleanup'],
            env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        def gc_started():
            return subprocess.run(['docker', 'exec', 'registry-gc', 'test', '-f', '/var/lib/registry/gc-started'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0

        self.wait(gc_started)
        process.send_signal(signum)
        out, err = process.communicate(timeout=30)
        self.assertEqual(process.returncode, 143 if signum == signal.SIGTERM else -signal.SIGKILL, out + err)
        if signum == signal.SIGTERM:
            self.assertEqual(self.cmd('docker', 'ps', '--all', '--quiet', '--filter', 'name=^/registry-gc$'), '')
            self.cmd('docker', 'exec', 'docker-registry', 'rm', '-f', '/var/lib/registry/hold', '/var/lib/registry/gc-started')


if __name__ == '__main__':
    unittest.main(verbosity=2)
