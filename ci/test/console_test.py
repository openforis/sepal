"""Console feedback through the real output filter and shell helper; no Docker daemon needed."""
import os
from pathlib import Path
import re
import selectors
import signal
import subprocess
import sys
import tempfile
import unittest


CI = Path(__file__).resolve().parent.parent


class ConsoleTest(unittest.TestCase):
    def test_the_live_log_is_available_before_a_held_operation_finishes(self):
        with tempfile.TemporaryDirectory() as workspace:
            log = Path(workspace) / 'build-logs/42/sample.build.log'
            url = 'https://jenkins.example/job/folder/job/Sepal-test/'
            env = {**os.environ, 'WORKSPACE': workspace, 'NO_COLOR': '1',
                'JOB_URL': url, 'BUILD_NUMBER': '42', 'BUILD_URL': url + '42/', 'BUILD_LOGS': str(log.parent)}
            process = subprocess.Popen(['bash', '-c',
                'set -euo pipefail\nsource "$1"\nlogged sample build sh -c \'read -r release; echo finished\'',
                'console-test', str(CI / 'console.sh')], env=env, stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
            output = b''
            try:
                with selectors.DefaultSelector() as ready:
                    ready.register(process.stdout, selectors.EVENT_READ)
                    while b'Live log: ' not in output or not output.endswith(b'\n'):
                        self.assertTrue(ready.select(timeout=5), 'No live-log link while the operation is held')
                        chunk = os.read(process.stdout.fileno(), 4096)
                        self.assertTrue(chunk, output.decode())
                        output += chunk
                self.assertIn(f'Live log: {url}ws/build-logs/42/sample.build.log\n'.encode(), output)
                self.assertTrue(log.is_file(), 'The advertised log must exist')
                self.assertIsNone(process.poll(), output.decode())
                self.assertNotIn(b'Details of', output)
                remaining, _ = process.communicate(b'continue\n', timeout=5)
                output = (output + remaining).decode()
                self.assertEqual(process.returncode, 0, output)
                self.assertIn('sample: build passed', output)
                self.assertNotIn('/artifact/', output)
                self.assertEqual(log.read_text(), 'finished\n')
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.communicate()

    def test_live_links_keep_builds_separate_and_preserve_existing_diagnostics(self):
        with tempfile.TemporaryDirectory() as workspace:
            url = 'https://jenkins.example/job/Sepal-test/'
            for build in ('42', '43'):
                log = Path(workspace) / f'build-logs/{build}/sample.build.log'
                log.parent.mkdir(parents=True)
                log.write_text(f'earlier diagnostic from {build}\n')
                result = run_shell(workspace, 'logged sample build echo new diagnostic', env={
                    'JOB_URL': url, 'BUILD_URL': url + build + '/', 'BUILD_NUMBER': build,
                    'BUILD_LOGS': str(log.parent)})
                self.assertEqual(result.returncode, 0, result.stdout)
                self.assertIn(f'Live log: {url}ws/build-logs/{build}/sample.build.log', result.stdout)
                self.assertNotIn('/artifact/', result.stdout)
            self.assertEqual((Path(workspace) / 'build-logs/42/sample.build.log').read_text(),
                'earlier diagnostic from 42\nnew diagnostic\n')
            self.assertEqual(log.read_text(), 'earlier diagnostic from 43\nnew diagnostic\n')

    def test_outside_jenkins_links_remain_workspace_relative(self):
        with tempfile.TemporaryDirectory() as workspace:
            result = run_shell(workspace, 'logged sample build echo diagnostic', env={
                'JOB_URL': '', 'BUILD_URL': 'https://jenkins.example/job/Sepal-test/42/'})
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertIn('Live log: build-logs/sample.build.log\n', result.stdout)
            self.assertNotIn('https://', result.stdout)

    def test_a_log_that_cannot_be_created_is_not_advertised_and_the_command_does_not_run(self):
        with tempfile.TemporaryDirectory() as workspace:
            invalid = Path(workspace) / 'not-a-directory'
            invalid.touch()
            result = run_shell(workspace, 'logged sample build touch "$WORKSPACE/ran"',
                env={'BUILD_LOGS': str(invalid)})
            self.assertNotEqual(result.returncode, 0, result.stdout)
            self.assertNotIn('Live log:', result.stdout)
            self.assertFalse((Path(workspace) / 'ran').exists())

    def test_service_logs_use_the_same_live_destination_and_label(self):
        with tempfile.TemporaryDirectory() as workspace:
            binary = Path(workspace) / 'bin'
            binary.mkdir()
            docker = binary / 'docker'
            docker.write_text('#!/bin/sh\ncase " $* " in\n'
                '    *" ps --all --services ") echo mysql ;;\n'
                '    *" logs "*) echo service diagnostic ;;\n'
                '    *) exit 2 ;;\nesac\n')
            docker.chmod(0o755)
            log = Path(workspace) / 'build-logs/42/mysql.service.log'
            url = 'https://jenkins.example/job/Sepal-test/'
            result = subprocess.run(['bash', str(CI / 'test-images.sh'), 'service-logs'],
                env={**os.environ, 'WORKSPACE': workspace, 'TEST_PROJECT': 'fixture', 'NO_COLOR': '1',
                    'JOB_URL': url, 'BUILD_URL': url + '42/', 'BUILD_LOGS': str(log.parent),
                    'PATH': str(binary) + os.pathsep + os.environ['PATH']},
                text=True, capture_output=True, timeout=5)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn(f'Live log: {url}ws/build-logs/42/mysql.service.log', result.stdout)
            self.assertNotIn('/artifact/', result.stdout)
            self.assertEqual(log.read_text(), 'service diagnostic\n')

    def test_sandbox_progress_keeps_details_in_the_log_and_reports_named_steps(self):
        output = (
            '#11 [6/57] RUN /script/init_gpu.sh\n'
            '#11 0.1 SEPAL_PROGRESS Installing CUDA toolkit\n'
            '#11 0.2 Reading package lists...\n'
            '#11 0.3 warning: third-party compiler detail\n'
            '#11 DONE 422.6s\n'
            '#27 [22/57] RUN /script/init_r_packages.sh\n'
            '#27 1.0 SEPAL_PROGRESS Installing GitHub R packages\n'
            "#27 2.0 * installing *source* package 'interp' ...\n"
            '#27 3.0 SEPAL_PROGRESS Checking R package loads (25/100)\n'
            '#27 DONE 1230.1s\n'
            '#63 exporting to image\n'
            '#63 exporting layers\n'
            '#63 DONE 261.3s\n'
        )
        result = run_filter(output, sandbox=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout, output)
        self.assertIn('sandbox: GPU libraries — Installing CUDA toolkit', result.stderr)
        self.assertIn('sandbox: GPU libraries completed in 7m 3s', result.stderr)
        self.assertIn('sandbox: R packages — compiling interp', result.stderr)
        self.assertIn('sandbox: R packages — Checking R package loads (25/100)', result.stderr)
        self.assertIn('sandbox: R packages completed in 20m 30s', result.stderr)
        self.assertIn('sandbox: exporting image layers completed in 4m 21s', result.stderr)
        self.assertNotIn('Reading package lists', result.stderr)
        self.assertNotIn('third-party compiler detail', result.stderr)
        self.assertNotIn('last active step', result.stderr)

    def test_cached_steps_are_identified_without_replaying_installation_output(self):
        result = run_filter('#11 [6/57] RUN /script/init_gpu.sh\n#11 CACHED\n', sandbox=True)
        self.assertIn('sandbox: GPU libraries cached', result.stderr)
        self.assertNotIn('completed in', result.stderr)

    def test_timestamped_installer_output_cannot_complete_or_cache_a_step(self):
        for payload in ('CACHED', 'DONE 99.0s'):
            with self.subTest(payload=payload):
                output = (
                    '#27 [22/57] RUN /script/init_r_packages.sh\n'
                    f'#27 0.192 {payload}\n'
                    '#27 1.0 SEPAL_PROGRESS Checking R package loads (1/2)\n'
                    '#27 DONE 2.0s\n'
                )
                result = run_filter(output, sandbox=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stdout, output)
                self.assertNotIn('cached', result.stderr)
                self.assertIn('R packages — Checking R package loads (1/2)', result.stderr)
                self.assertEqual(result.stderr.count('completed in'), 1)
                self.assertIn('R packages completed in 2s', result.stderr)

    def test_clipping_is_visible_once_and_does_not_hide_the_active_step(self):
        result = run_filter(
            '#27 [22/57] RUN /script/init_r_packages.sh\n'
            '#27 1.0 SEPAL_PROGRESS Installing GitHub R packages\n'
            '#27 2.0 [output clipped, log limit 2MiB reached]\n'
            '#27 3.0 [output clipped, log limit 2MiB reached]\n', sandbox=True)
        self.assertEqual(result.stderr.count('WARNING:'), 1)
        self.assertIn('diagnostics are incomplete', result.stderr)
        self.assertIn('last active step: R packages — Installing GitHub R packages', result.stderr)

    def test_an_unfinished_step_is_named_when_output_ends(self):
        result = run_filter(
            '#27 [22/57] RUN /script/init_r_packages.sh\n'
            '#27 1.0 SEPAL_PROGRESS Installing R Torch runtime\n'
            '#27 ERROR: process exited with code 1\n', sandbox=True)
        self.assertIn('last active step: R packages — Installing R Torch runtime', result.stderr)

    def test_progress_is_live_while_the_producer_is_still_running(self):
        with tempfile.TemporaryFile() as log:
            process = subprocess.Popen([sys.executable, str(CI / 'console.py'), '0.01'],
                stdin=subprocess.PIPE, stdout=log, stderr=subprocess.PIPE)
            try:
                with selectors.DefaultSelector() as ready:
                    ready.register(process.stderr, selectors.EVENT_READ)
                    process.stdin.write(b'#27 [22/57] RUN /script/init_r_packages.sh\n')
                    process.stdin.flush()
                    self.assertTrue(ready.select(timeout=5), 'No live progress before stdin closed')
                    self.assertIn(b'sandbox: R packages', os.read(process.stderr.fileno(), 4096))
                    self.assertTrue(ready.select(timeout=5), 'No heartbeat while the step is silent')
                    self.assertIn(b'elapsed', os.read(process.stderr.fileno(), 4096))
                self.assertIsNone(process.poll())
                process.send_signal(signal.SIGTERM)
                _, feedback = process.communicate(timeout=5)
                self.assertEqual(process.returncode, 143)
                self.assertIn(b'last active step: R packages', feedback)
            finally:
                if process.poll() is None:
                    process.kill()
                process.communicate()

    def test_plain_logs_preserve_lines_without_terminal_codes(self):
        result = run_filter('\x1b[31mred\x1b[0m\r\nstep 1\rstep 2\nlast')
        self.assertEqual(result.stdout, 'red\nstep 1\nstep 2\nlast\n')
        self.assertEqual(result.stderr, '')

    def test_filter_write_failure_fails_the_operation_instead_of_reporting_success(self):
        with tempfile.TemporaryDirectory() as workspace:
            result = run_shell(workspace, '''
                ulimit -f 4
                logged sample output sh -c 'head -c 8192 /dev/zero | tr "\\0" x; echo'
            ''')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Cannot write the log:', result.stdout)
            self.assertIn('sample: output FAILED', result.stdout)

    def test_a_failed_sandbox_reports_its_step_status_excerpt_and_live_log(self):
        with tempfile.TemporaryDirectory() as workspace:
            result = run_shell(workspace, '''
                logged sandbox build sh -c 'printf "%s\\n" \
                    "#27 [22/57] RUN /script/init_r_packages.sh" \
                    "#27 1.0 SEPAL_PROGRESS Installing R Torch runtime" \
                    "#27 2.0 failed to download runtime"; exit 3'
            ''')
            self.assertEqual(result.returncode, 3, result.stdout)
            self.assertIn('last active step: R packages — Installing R Torch runtime', result.stdout)
            self.assertIn('sandbox: build FAILED', result.stdout)
            self.assertIn('failed to download runtime', result.stdout)
            self.assertIn('Full log:', result.stdout)
            self.assertNotIn('Details of sandbox', result.stdout)

    def test_cancelling_the_whole_operation_group_reports_its_status_and_diagnostics(self):
        with tempfile.TemporaryDirectory() as workspace:
            installer = Path(workspace) / 'installer.py'
            installer.write_text(
                'import signal\n'
                'print("#27 [22/57] RUN /script/init_r_packages.sh", flush=True)\n'
                'print("#27 0.1 completed diagnostic line", flush=True)\n'
                'print("#27 0.2 SEPAL_PROGRESS Installing R Torch runtime", flush=True)\n'
                'signal.pause()\n')
            process = subprocess.Popen(['bash', '-c',
                'set -euo pipefail\nsource "$1"\nlogged sandbox build "$2" "$3"',
                'console-test', str(CI / 'console.sh'), sys.executable, str(installer)],
                env={**os.environ, 'WORKSPACE': workspace, 'NO_COLOR': '1'},
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT, start_new_session=True)
            output = b''
            try:
                with selectors.DefaultSelector() as ready:
                    ready.register(process.stdout, selectors.EVENT_READ)
                    while b'R packages \xe2\x80\x94 Installing R Torch runtime' not in output:
                        self.assertTrue(ready.select(timeout=5), 'No active installer feedback')
                        chunk = os.read(process.stdout.fileno(), 4096)
                        self.assertTrue(chunk, output.decode())
                        output += chunk
                os.killpg(process.pid, signal.SIGTERM)
                remaining, _ = process.communicate(timeout=5)
                output = (output + remaining).decode()
                self.assertEqual(process.returncode, 143, output)
                self.assertIn('last active step: R packages — Installing R Torch runtime', output)
                self.assertIn('sandbox: build STOPPED by signal 15', output)
                self.assertIn('The last 100 lines of its log:', output)
                self.assertIn('#27 0.1 completed diagnostic line', output)
                self.assertIn('Full log:', output)
                self.assertNotIn('passed', output)
                self.assertIn('completed diagnostic line',
                    (Path(workspace) / 'build-logs/sandbox.build.log').read_text())
            finally:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                process.communicate()

    def test_r_progress_counts_actual_checks_and_keeps_the_torch_check(self):
        result, checks, commands = run_r_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        total = len(checks)
        self.assertGreater(total, 0)
        self.assertIn('*** Installing R packages ***', result.stdout)
        self.assertIn(f'SEPAL_PROGRESS Checking R package loads (0/{total})', result.stdout)
        self.assertIn(f'SEPAL_PROGRESS Checking R package loads ({total}/{total})', result.stdout)
        self.assertIn("if (!torch::torch_is_installed())", commands)

    def test_r_runs_without_startup_banners_and_keeps_compiler_warnings(self):
        result, _, _ = run_r_installer()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertNotIn('R startup banner', result.stdout)
        self.assertIn('compiler warning: fixture diagnostic', result.stderr)

    def test_r_progress_does_not_turn_an_unloadable_package_into_a_success(self):
        result, checks, commands = run_r_installer(failing_package='glue')
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('Packages that fail to load: glue', result.stderr)
        self.assertIn(f'Checking R package loads ({len(checks)}/{len(checks)})', result.stdout)
        self.assertNotIn("if (!torch::torch_is_installed())", commands)


def run_filter(output, *, sandbox=False):
    return subprocess.run([sys.executable, str(CI / 'console.py'), *(['60'] if sandbox else [])],
        input=output, text=True, capture_output=True, timeout=5)


def run_shell(workspace, command, *, env=None):
    env = {**os.environ, 'WORKSPACE': workspace, 'NO_COLOR': '1',
        'BUILD_LOGS': str(Path(workspace) / 'build-logs'), 'JOB_URL': '', **(env or {})}
    return subprocess.run(['bash', '-c', 'set -euo pipefail\nsource "$1"\n' + command,
        'console-test', str(CI / 'console.sh')], env=env, text=True, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, timeout=10)


def run_r_installer(*, failing_package=''):
    with tempfile.TemporaryDirectory() as directory:
        path = Path(directory)
        # Only R and Rscript are replaced; the real installer owns ordering and failure handling.
        (path / 'R').write_text('#!/bin/sh\nprintf "%s\\n" "$*" >> "$R_COMMANDS"\n'
            'if [ "$1" != CMD ]; then\n'
            '    case " $* " in *" --no-echo "*) ;; *) echo "R startup banner" ;; esac\n'
            '    echo "compiler warning: fixture diagnostic" >&2\n'
            'fi\n')
        (path / 'Rscript').write_text(
            '#!/bin/sh\nprintf "%s\\n" "$2" >> "$R_CHECKS"\n'
            'if [ -n "$FAILING_PACKAGE" ] && [ "$2" = "loadNamespace(\'$FAILING_PACKAGE\')" ]; then exit 1; fi\n')
        for executable in ('R', 'Rscript'):
            (path / executable).chmod(0o755)
        env = {**os.environ, 'PATH': str(path) + os.pathsep + os.environ['PATH'],
            'R_COMMANDS': str(path / 'commands'), 'R_CHECKS': str(path / 'checks'), 'FAILING_PACKAGE': failing_package}
        result = subprocess.run(['bash', str(CI.parent / 'modules/sandbox/script/init_r_packages.sh')],
            env=env, text=True, capture_output=True, timeout=10)
        checks = re.findall(r"loadNamespace\('([^']+)'\)", (path / 'checks').read_text())
        return result, checks, (path / 'commands').read_text()


if __name__ == '__main__':
    unittest.main()
