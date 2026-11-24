import json
import os
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from select_jobs import changed_paths, select_jobs  # noqa: E402

SHARED = {'module': 'lib/js/shared', 'lock': 'modules/worker/lib/shared/package-lock.json'}
GEE = {'module': 'modules/gee', 'libs': 'lib/js/shared lib/js/ee'}
GUI = {'module': 'modules/gui'}
USER = {'module': 'modules/user', 'libs': 'lib/js/shared'}
USER_FILES = {'module': 'modules/user-files', 'libs': 'lib/js/shared'}
WORKER = {'module': 'modules/worker', 'libs': 'lib/js/shared'}
STANDALONE = {'module': 'modules/standalone'}
MODULES = [SHARED, GEE, GUI, USER, USER_FILES, WORKER, STANDALONE]
OTHER_JOBS = {'lint', 'python', 'deploy', 'shell'}


class SelectJobsTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = self.tmp.name
        package(self.root, 'lib/js/shared')
        package(self.root, 'lib/js/ee')
        package(self.root, 'modules/gee', sepal='../../lib/js/shared', **{'sepal-ee': '../../lib/js/ee'})
        package(self.root, 'modules/gui', sepal='../../lib/js/shared')
        package(self.root, 'modules/user', sepal='../../lib/js/shared')
        package(self.root, 'modules/user-files', sepal='file:../../lib/js/shared')
        package(self.root, 'modules/worker', sepal='../../lib/js/shared')
        package(self.root, 'modules/standalone', lodash='^4.17.21')

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_deploy_script_change_runs_only_the_deploy_tests(self):
        jobs = select_jobs(['hosting-services/aws/sepal/deploy.sh'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [])
        self.assertEqual(running(jobs), {'deploy'})

    def test_a_gui_change_runs_the_gui_tests_and_lint(self):
        jobs = select_jobs(['modules/gui/src/app.jsx'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [GUI])
        self.assertEqual(running(jobs), {'lint'})

    def test_a_module_change_runs_that_module_with_its_matrix_settings(self):
        jobs = select_jobs(['modules/gee/src/main.js'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [GEE])
        self.assertEqual(running(jobs), set())

    def test_a_module_change_leaves_a_module_whose_name_it_prefixes(self):
        jobs = select_jobs(['modules/user-files/src/main.js'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [USER_FILES])

    def test_a_shared_library_change_runs_every_module_that_links_it(self):
        jobs = select_jobs(['lib/js/shared/src/log.js'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [SHARED, GEE, GUI, USER, USER_FILES, WORKER])
        self.assertEqual(running(jobs), set())

    def test_an_earth_engine_library_change_runs_only_its_consumers(self):
        jobs = select_jobs(['lib/js/ee/src/aoi.js'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [GEE])

    def test_a_lock_change_runs_the_library_tested_with_it(self):
        jobs = select_jobs([SHARED['lock']], self.root, MODULES)

        self.assertEqual(jobs['tests'], [SHARED, WORKER])

    def test_an_app_manager_change_runs_the_shell_tests(self):
        jobs = select_jobs(['modules/app-manager/update-app.sh'], self.root, MODULES)

        self.assertEqual(running(jobs), {'shell'})

    def test_an_ops_change_runs_the_shell_tests(self):
        jobs = select_jobs(['modules/ops/script/sepal-build.sh'], self.root, MODULES)

        self.assertEqual(running(jobs), {'shell'})

    def test_a_deploy_launcher_change_runs_its_guard_tests(self):
        jobs = select_jobs(['bin/deploy'], self.root, MODULES)

        self.assertEqual(running(jobs), {'shell'})

    def test_console_and_installer_changes_run_the_console_tests(self):
        for path in ('ci/console.py', 'ci/console.sh', 'ci/test/console_test.py',
                     'ci/shell-checks.sh', 'modules/sandbox/script/init_gpu.sh',
                     'modules/sandbox/script/init_r_packages.sh'):
            with self.subTest(path=path):
                jobs = select_jobs([path], self.root, MODULES)

                self.assertEqual(jobs['tests'], [])
                self.assertEqual(running(jobs), {'shell'})

    def test_a_python_library_change_runs_the_python_tests(self):
        jobs = select_jobs(['lib/python/shared/stack.py'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [])
        self.assertEqual(running(jobs), {'python'})

    def test_a_change_outside_every_job_runs_nothing(self):
        jobs = select_jobs(['docs/recipes/README.md', 'bin/dev-env'], self.root, MODULES)

        self.assertEqual(jobs['tests'], [])
        self.assertEqual(running(jobs), set())

    def test_a_workflow_change_runs_everything(self):
        jobs = select_jobs(['.github/workflows/test.yml'], self.root, MODULES)

        self.assertEqual(jobs['tests'], MODULES)
        self.assertEqual(running(jobs), OTHER_JOBS)

    def test_an_unknown_change_set_runs_everything(self):
        jobs = select_jobs(None, self.root, MODULES)

        self.assertEqual(jobs['tests'], MODULES)
        self.assertEqual(running(jobs), OTHER_JOBS)


class ChangedPathsTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.repo = self.tmp.name
        git(self.repo, 'init', '--quiet', '--initial-branch', 'master')
        self.base = commit(self.repo, {'docs/readme.md': 'base', 'modules/gui/old.js': 'gui'})

    def tearDown(self):
        self.tmp.cleanup()

    def test_a_push_lists_every_path_changed_since_the_previous_push(self):
        commit(self.repo, {'modules/gee/a.js': 'a'})
        commit(self.repo, {'modules/worker/b.js': 'b'})

        paths = changed_paths('push', self.base, self.repo)

        self.assertEqual(paths, ['modules/gee/a.js', 'modules/worker/b.js'])

    def test_a_moved_file_lists_both_its_old_and_new_path(self):
        os.makedirs(os.path.join(self.repo, 'modules/gee'))
        git(self.repo, 'mv', 'modules/gui/old.js', 'modules/gee/new.js')
        git(self.repo, 'commit', '--quiet', '-m', 'move')

        paths = changed_paths('push', self.base, self.repo)

        self.assertEqual(paths, ['modules/gee/new.js', 'modules/gui/old.js'])

    def test_a_pull_request_lists_what_its_merge_commit_adds_to_the_base(self):
        git(self.repo, 'checkout', '--quiet', '-b', 'feature')
        commit(self.repo, {'modules/gee/feature.js': 'feature'})
        git(self.repo, 'checkout', '--quiet', 'master')
        commit(self.repo, {'modules/worker/base-moved-on.js': 'base'})
        git(self.repo, 'merge', '--quiet', '--no-ff', '-m', 'merge', 'feature')

        paths = changed_paths('pull_request', '', self.repo)

        self.assertEqual(paths, ['modules/gee/feature.js'])

    def test_a_new_branch_push_has_no_known_change_set(self):
        commit(self.repo, {'modules/gee/a.js': 'a'})

        self.assertIsNone(changed_paths('push', '0' * 40, self.repo))

    def test_a_push_after_an_unreachable_commit_has_no_known_change_set(self):
        commit(self.repo, {'modules/gee/a.js': 'a'})

        self.assertIsNone(changed_paths('push', 'f' * 40, self.repo))

    def test_a_manual_run_has_no_known_change_set(self):
        self.assertIsNone(changed_paths('workflow_dispatch', '', self.repo))


def running(jobs):
    return {job for job in OTHER_JOBS if jobs[job]}


def package(root, module, **dependencies):
    os.makedirs(os.path.join(root, module))
    with open(os.path.join(root, module, 'package.json'), 'w') as f:
        json.dump({'name': os.path.basename(module), 'dependencies': dependencies}, f)


def commit(repo, files):
    for path, content in files.items():
        os.makedirs(os.path.dirname(os.path.join(repo, path)), exist_ok=True)
        with open(os.path.join(repo, path), 'w') as f:
            f.write(content)
        git(repo, 'add', path)
    git(repo, 'commit', '--quiet', '-m', 'change')
    return git(repo, 'rev-parse', 'HEAD')


def git(repo, *args):
    env = {**os.environ, 'GIT_AUTHOR_NAME': 'test', 'GIT_AUTHOR_EMAIL': 'test@example.com',
           'GIT_COMMITTER_NAME': 'test', 'GIT_COMMITTER_EMAIL': 'test@example.com'}
    return subprocess.run(['git', *args], cwd=repo, env=env, check=True, capture_output=True, text=True).stdout.strip()


if __name__ == '__main__':
    unittest.main()
