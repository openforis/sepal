#!/usr/bin/env python3
"""Selects the jobs of the Test workflow that the triggering change affects.

A module's tests run when its directory, a library its package.json links, the lock it is
tested with or, for an entry that asks for Postgres, the SEPAL Postgres image changes. Everything runs when the change set is unknown (a manual run, a new branch,
an unreachable previous push) or when the workflow itself changes. Writes the selection to
$GITHUB_OUTPUT: `tests` holds the matrix entries to run, the other outputs are 'true' or 'false'.
"""
import json
import os
import subprocess
import sys

REPO_ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

TEST_MODULES = [
    # The library carries no lock of its own, so it is tested with the one most modules install it
    # from. Its gdal wrapper shells out to the GDAL tools.
    {'module': 'lib/js/shared', 'lock': 'modules/worker/lib/shared/package-lock.json',
     'packages': 'gdal-bin python3-gdal', 'postgres': True},
    {'module': 'modules/gui'},
    {'module': 'modules/gee', 'libs': 'lib/js/shared lib/js/ee'},
    {'module': 'modules/task', 'libs': 'lib/js/shared'},
    {'module': 'modules/task-manager', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/app-manager', 'libs': 'lib/js/shared'},
    {'module': 'modules/budget', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/email', 'libs': 'lib/js/shared'},
    {'module': 'modules/gateway', 'libs': 'lib/js/shared'},
    {'module': 'modules/message', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/r-proxy', 'libs': 'lib/js/shared'},
    {'module': 'modules/recipe', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/scene', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/ssh-gateway', 'libs': 'lib/js/shared'},
    {'module': 'modules/storage', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/terminal', 'libs': 'lib/js/shared'},
    {'module': 'modules/user', 'libs': 'lib/js/shared', 'postgres': True},
    {'module': 'modules/user-assets', 'libs': 'lib/js/shared'},
    {'module': 'modules/user-files', 'libs': 'lib/js/shared'},
    {'module': 'modules/worker', 'libs': 'lib/js/shared', 'postgres': True},
]

JOB_PATHS = {
    'lint': ['modules/gui'],
    'python': ['lib/python/shared'],
    'deploy': ['hosting-services'],
    'shell': ['modules/app-manager', 'modules/ops', 'bin/deploy'],
}

RUN_ALL_PATHS = ['.github']

POSTGRES_IMAGE = 'modules/postgres'


def main(env):
    changed = changed_paths(env.get('EVENT', ''), env.get('BEFORE', ''), REPO_ROOT)
    jobs = select_jobs(changed, REPO_ROOT)
    report(changed, jobs)
    with open(env['GITHUB_OUTPUT'], 'a') as output:
        output.write(f"tests={json.dumps(jobs['tests'])}\n")
        for job in JOB_PATHS:
            output.write(f'{job}={str(jobs[job]).lower()}\n')


def changed_paths(event, before, repo):
    """Returns the paths the triggering change touches, or None when they cannot be known."""
    if event == 'pull_request':
        # A pull request run checks out the merge commit, whose first parent is the base branch.
        return diff('HEAD^1', repo)
    if event == 'push' and before.strip('0') and (has_commit(before, repo) or fetch(before, repo)):
        return diff(before, repo)
    return None


def select_jobs(changed, root, modules=TEST_MODULES):
    run_all = changed is None or touches(changed, RUN_ALL_PATHS)

    def affected(paths):
        return run_all or touches(changed, paths)

    return {
        'tests': [entry for entry in modules if affected(trigger_paths(entry, root))],
        **{job: affected(paths) for job, paths in JOB_PATHS.items()},
    }


def report(changed, jobs):
    if changed is None:
        print('Change set unknown: running every job')
    else:
        print(f'{len(changed)} changed paths')
    print('Tests:', ', '.join(entry['module'] for entry in jobs['tests']) or 'none')
    print('Other jobs:', ', '.join(job for job in JOB_PATHS if jobs[job]) or 'none')


def trigger_paths(entry, root):
    module = entry['module']
    return [
        module,
        *linked_libraries(module, root),
        *([entry['lock']] if 'lock' in entry else []),
        *([POSTGRES_IMAGE] if entry.get('postgres') else []),
    ]


def linked_libraries(module, root):
    try:
        with open(os.path.join(root, module, 'package.json')) as f:
            package = json.load(f)
    except FileNotFoundError:
        return []
    dependencies = {**package.get('dependencies', {}), **package.get('devDependencies', {})}
    targets = [version.removeprefix('file:') for version in dependencies.values()]
    return [os.path.normpath(os.path.join(module, target)) for target in targets if target.startswith('.')]


def touches(changed, prefixes):
    return any(path == prefix or path.startswith(prefix + '/') for path in changed for prefix in prefixes)


def diff(base, repo):
    # Without --no-renames a moved file lists only its new path, hiding the module it left.
    result = git(repo, 'diff', '--name-only', '-z', '--no-renames', base, 'HEAD')
    return [path for path in result.stdout.split('\0') if path] if result.returncode == 0 else None


def has_commit(sha, repo):
    return git(repo, 'cat-file', '-e', f'{sha}^{{commit}}').returncode == 0


def fetch(sha, repo):
    return git(repo, 'fetch', '--quiet', '--no-tags', '--depth=1', 'origin', sha).returncode == 0


def git(repo, *args):
    return subprocess.run(['git', *args], cwd=repo, capture_output=True, text=True)


if __name__ == '__main__':
    main(os.environ)
