#!/usr/bin/env python3
"""Coordinate registry maintenance and image consumers on the single ops host."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time
from uuid import uuid4
from datetime import datetime, timezone
import xml.etree.ElementTree as ET

from registry_cleanup import BUILD, CleanupError, Registry, plan_cleanup

MAINTENANCE = 'maintenance/registry-cleanup'
GC_LABEL = 'org.openforis.sepal.registry-gc'


class GitTags:
    def __init__(self, repo):
        self.repo = str(repo)

    def git(self, *args):
        result = subprocess.run(['git', '-C', self.repo, *args], capture_output=True, text=True)
        if result.returncode:
            raise CleanupError(f'Git {args[0]} failed: {result.stderr.strip()}')
        return result.stdout.strip()

    def read(self):
        refs = {}
        for line in self.git('ls-remote', '--tags', 'origin').splitlines():
            sha, ref = line.split()
            name = ref.removeprefix('refs/tags/')
            if name.endswith('^{}'):
                refs[name[:-3]] = sha
            else:
                refs.setdefault(name, sha)
        return refs

    def create(self, name, commit):
        ref = 'refs/tags/' + name
        self.git('push', '--quiet', '--force-with-lease=' + ref + ':', 'origin', commit + ':' + ref)

    def remove(self, name):
        ref = 'refs/tags/' + name
        found = self.git('ls-remote', '--refs', 'origin', ref)
        if found:
            sha, _ = found.split()
            self.git('push', '--quiet', '--force-with-lease=' + ref + ':' + sha, 'origin', ':' + ref)

    def ensure_commit(self, commit):
        if not re.fullmatch('[0-9a-f]{40}', commit):
            raise CleanupError('Invalid build commit')
        if subprocess.run(['git', '-C', self.repo, 'cat-file', '-e', commit + '^{commit}'],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode:
            self.git('fetch', '--quiet', '--no-tags', 'origin', commit)

    def repositories(self, commit):
        self.ensure_commit(commit)
        result = subprocess.run(['git', '-C', self.repo, 'show', commit + ':dev-env/config/deps.json'],
            capture_output=True, text=True)
        if not result.returncode:
            try:
                deps = json.loads(result.stdout)
            except ValueError:
                raise CleanupError('Invalid build dependency metadata') from None
            if any('ci' in value for value in deps.values()):
                names = [name for name, value in deps.items() if value.get('ci') == 'push']
            else:
                names = None
        else:
            names = None
        if names is None:
            script = self.git('show', commit + ':modules/ops/script/build-and-push-images.sh')
            names = re.findall(r'^push ([a-z0-9-]+)\s*$', script, re.MULTILINE)
        if not names or any(not re.fullmatch('[a-z0-9-]+', name) for name in names):
            raise CleanupError('Cannot identify the images this build pushed')
        return ['openforis/' + name for name in names]


def protect_run(git, environment, build, record, command, *, wait=False):
    if not BUILD.fullmatch(build) or not re.fullmatch('[a-z0-9-]+', environment):
        raise CleanupError('Invalid build or deployment environment')
    commit = git.read().get('build-' + build)
    while commit is None and wait:
        print(f'Waiting for build {build}; checking for its tag again in a minute', flush=True)
        time.sleep(60)
        commit = git.read().get('build-' + build)
    if commit is None:
        raise CleanupError(f'Missing remote build-{build} tag')
    git.ensure_commit(commit)
    started = datetime.now(timezone.utc)
    marker = f'deploying/{environment}/{started.strftime("%Y%m%dT%H%M%S.%fZ")}/{build}/{uuid4().hex}'
    git.create(marker, commit)
    try:
        refs = git.read()
        if MAINTENANCE in refs:
            raise CleanupError('Registry cleanup is active or needs recovery; run Sepal-cleanup in dry-run mode')
    except BaseException:
        git.remove(marker)
        raise
    print(f'Protecting build {build} with {marker}', flush=True)
    complete = False
    try:
        status = child(command, dict(os.environ, SEPAL_REGISTRY_GUARDED='1'))
        if status:
            return status
        if record:
            prefix = 'deployed/' + environment + '/'
            earliest = started.strftime('%Y%m%dT%H%M%SZ')
            refs = git.read()
            matching = any(name.startswith(prefix) and len(name.split('/')) == 4
                and name.split('/')[2] >= earliest and name.endswith('/' + build) and sha == commit
                for name, sha in refs.items())
            if not matching:
                name = prefix + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ') + '/' + build
                git.create(name, commit)
                if git.read().get(name) != commit:
                    raise CleanupError('Cannot confirm the deployment record')
        git.remove(marker)
        complete = True
        return 0
    finally:
        if not complete:
            print(f'Protection retained: {marker}. Review the operation before removing this remote tag.', file=sys.stderr)


def child(command, env=None, lock_fd=None):
    process = subprocess.Popen(command, env=env, start_new_session=True,
        pass_fds=() if lock_fd is None else (lock_fd,))
    try:
        status = process.wait()
        return status if status >= 0 else 128 - status
    except BaseException:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            process.wait()
        except ProcessLookupError:
            pass
        raise


class DockerRegistry:
    def __init__(self, registry):
        self.registry = registry

    def docker(self, *args):
        result = subprocess.run(['docker', *args], capture_output=True, text=True)
        if result.returncode:
            raise CleanupError(f'Docker {args[0]} failed: {result.stderr.strip()}')
        return result.stdout.strip()

    def inspect(self, name):
        return json.loads(self.docker('inspect', '--format', '{{json .}}', name))

    def running(self):
        return self.inspect('docker-registry')['State']['Running']

    def gc_exists(self):
        return bool(self.docker('ps', '--all', '--quiet', '--filter', 'name=^/registry-gc$'))

    def remove_gc(self):
        if self.gc_exists():
            if self.inspect('registry-gc')['Config']['Labels'].get(GC_LABEL) != 'true':
                raise CleanupError('registry-gc is not a SEPAL cleanup container; refusing to remove it')
            self.docker('rm', '--force', 'registry-gc')
        if self.gc_exists():
            raise CleanupError('Garbage collection still exists; registry must stay stopped')

    def start(self):
        self.docker('start', 'docker-registry')

    def wait_ready(self):
        deadline = time.monotonic() + 60
        while True:
            try:
                self.registry.ready()
                return
            except CleanupError:
                if time.monotonic() >= deadline:
                    raise
                time.sleep(0.5)

    def check_version(self):
        version = self.docker('exec', 'docker-registry', 'registry', '--version')
        if not re.search(r'/v3\s+3\.', version):
            raise CleanupError('Cleanup requires the deployed Registry 3 image')

    def collect(self):
        image = self.inspect('docker-registry')['Image']
        self.docker('stop', 'docker-registry')
        # Create and start separately: an interrupted create can leave only a stopped container.
        self.docker('create', '--pull', 'never', '--name', 'registry-gc', '--label', GC_LABEL + '=true',
            '--network', 'none', '--volumes-from', 'docker-registry', '--entrypoint', 'registry',
            image, 'garbage-collect', '/etc/distribution/config.yml')
        self.docker('start', 'registry-gc')
        print('Registry stopped; garbage collection running. Pulls are temporarily unavailable.', flush=True)
        status = self.docker('wait', 'registry-gc')
        subprocess.run(['docker', 'logs', 'registry-gc'], check=True)
        if status != '0':
            raise CleanupError('Garbage collection failed with status ' + status)
        self.remove_gc()
        self.start()
        self.wait_ready()


def recover(git, host):
    changed = host.gc_exists()
    if changed:
        host.remove_gc()
    if not host.running():
        host.start()
        changed = True
    refs = git.read()
    if changed or MAINTENANCE in refs:
        host.wait_ready()
        git.remove(MAINTENANCE)
        print('Registry recovery complete', flush=True)


def cleanup(git, registry, host, dry_run):
    try:
        git.create(MAINTENANCE, git.git('rev-parse', 'HEAD'))
        refs = git.read()
        active = sorted(name for name in refs if name.startswith('deploying/'))
        if active:
            print('Cleanup skipped; image consumers still have protection (review old markers manually):')
            for marker in active:
                print(marker + marker_age(marker))
            return
        try:
            plan = plan_cleanup(registry, refs, git.repositories)
        except CleanupError as error:
            print(f'DRY RUN: no deletion, because protected images could not be established: {error}')
            return
        dry_run = dry_run or not plan.enabled
        print(('DRY RUN' if dry_run else 'APPLY') + ': keeping builds ' + ', '.join(sorted(plan.protected)))
        for reason in plan.reasons:
            print('DRY RUN: ' + reason)
        if not dry_run:
            host.check_version()
        for repo, digest in plan.delete:
            print(f'{"Would delete" if dry_run else "Deleting"} {repo}@{digest}', flush=True)
            if not dry_run:
                registry.delete(repo, digest)
        if not dry_run:
            host.collect()
        for repo, tag in plan.untag:
            print(f'{"Would untag" if dry_run else "Untagging"} {repo}:{tag}', flush=True)
            if not dry_run:
                registry.delete(repo, tag)
        print(f'{len(plan.delete)} manifests; {len(plan.untag)} stale shared-image tags', flush=True)
    finally:
        # A second cancellation must not interrupt restoration of the registry.
        handlers = {s: signal.signal(s, signal.SIG_IGN) for s in (signal.SIGTERM, signal.SIGINT)}
        try:
            recover(git, host)
        finally:
            for signum, handler in handlers.items():
                signal.signal(signum, handler)


def marker_age(marker):
    try:
        stamp = marker.split('/')[2]
        pattern = '%Y%m%dT%H%M%S.%fZ' if '.' in stamp else '%Y%m%dT%H%M%SZ'
        age = datetime.now(timezone.utc) - datetime.strptime(stamp, pattern).replace(tzinfo=timezone.utc)
        return f' ({int(age.total_seconds() // 3600)} hours old' + (', possibly abandoned)' if age.days else ')')
    except (ValueError, IndexError):
        return ' (unknown age; still protected)'


def recovery_repo(home):
    repo = home / 'registry-coordination.git'
    url = ET.parse(home / 'jobs/Sepal/config.xml').findtext('.//hudson.plugins.git.UserRemoteConfig/url')
    if not url:
        raise CleanupError('Cannot find the Jenkins Git remote for registry recovery')
    if not repo.exists():
        subprocess.run(['git', 'init', '--bare', '--quiet', str(repo)], check=True)
        subprocess.run(['git', '-C', str(repo), 'remote', 'add', 'origin', url], check=True)
    else:
        subprocess.run(['git', '-C', str(repo), 'remote', 'set-url', 'origin', url], check=True)
    return repo


class Cancelled(Exception):
    def __init__(self, signum):
        self.signum = signum


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='operation', required=True)
    commands.add_parser('recover')
    clean = commands.add_parser('cleanup')
    clean.add_argument('--dry-run', action='store_true')
    build = commands.add_parser('build')
    build.add_argument('command', nargs=argparse.REMAINDER)
    protect = commands.add_parser('protect')
    protect.add_argument('--repo', required=True)
    protect.add_argument('--environment', required=True)
    protect.add_argument('--build', required=True)
    protect.add_argument('--record', action='store_true')
    protect.add_argument('--wait', action='store_true')
    protect.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()

    def cancelled(signum, _frame):
        raise Cancelled(signum)

    signal.signal(signal.SIGTERM, cancelled)
    signal.signal(signal.SIGINT, cancelled)
    try:
        if args.operation == 'protect':
            return protect_run(GitTags(args.repo), args.environment, args.build, args.record,
                args.command[1:] if args.command[:1] == ['--'] else args.command, wait=args.wait)
        home = Path(os.environ['JENKINS_HOME'])
        home.mkdir(parents=True, exist_ok=True)
        with (home / 'registry.lock').open('a') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            repo = recovery_repo(home) if args.operation == 'recover' else os.environ['WORKSPACE']
            git = GitTags(repo)
            registry = Registry(os.environ.get('REGISTRY_API_URL', 'http://docker-registry:5000'))
            host = DockerRegistry(registry)
            recover(git, host)
            if args.operation == 'cleanup':
                value = os.environ.get('DRY_RUN', 'true')
                if value not in ('true', 'false'):
                    raise CleanupError('DRY_RUN must be true or false')
                cleanup(git, registry, host, args.dry_run or value == 'true')
            elif args.operation == 'build':
                command = args.command[1:] if args.command[:1] == ['--'] else args.command
                return child(command, lock_fd=lock.fileno())
        return 0
    except Cancelled as error:
        return 128 + error.signum
    except (CleanupError, OSError, KeyError, ValueError, subprocess.SubprocessError) as error:
        print(f'Registry operation failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
