import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


SCRIPT = Path(__file__).resolve().parents[1] / 'roles/aws-mount-efs/files/sepal-restricted-home.sh'
FAKE_COMMAND = '''#!/usr/bin/env python3
import json
import os
from pathlib import Path
import sys
state_path = Path(os.environ['MOUNT_STATE'])
state = json.loads(state_path.read_text())
name = Path(sys.argv[0]).name
args = sys.argv[1:]
if name == 'findmnt':
    print(state['filesystem'] if 'FSTYPE' in args else state['options'])
elif name == 'mountpoint':
    sys.exit(0 if state['mounted'] else 1)
elif name == 'stat':
    print('1:2' if args[-1] == '/data/sepal/home' else state['identity'])
elif name == 'mount':
    state['mounts'].append(args)
    if args[0] == '--bind':
        state['mounted'] = True
    elif not state['ignore_flag']:
        state['options'] = args[1].replace('remount,bind,', '')
state_path.write_text(json.dumps(state))
'''


class RestrictedHomeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.directory = Path(self.tmp.name)
        for name in ['findmnt', 'mountpoint', 'stat', 'mount', 'mkdir']:
            command = self.directory / name
            command.write_text(FAKE_COMMAND)
            command.chmod(0o755)
        self.state_path = self.directory / 'state.json'
        self.state = {'filesystem': 'nfs4', 'options': 'rw,nosuid,nodev,relatime',
                      'mounted': False, 'identity': '1:2', 'ignore_flag': False, 'mounts': []}

    def run_script(self):
        self.state_path.write_text(json.dumps(self.state))
        result = subprocess.run(['sh', str(SCRIPT)], capture_output=True, text=True,
                                env=dict(os.environ, PATH=f'{self.directory}:{os.environ["PATH"]}',
                                         MOUNT_STATE=str(self.state_path)))
        self.state = json.loads(self.state_path.read_text())
        return result

    def test_binds_then_remounts_with_existing_restrictions_preserved(self):
        result = self.run_script()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(self.state['mounts'], [
            ['--bind', '/data/sepal/home', '/data/sepal/restricted/home'],
            ['-o', 'remount,bind,rw,nosuid,nodev,relatime,nosymfollow',
             '/data/sepal/home', '/data/sepal/restricted/home']])

    def test_refuses_a_local_directory_instead_of_the_efs_mount(self):
        self.state['filesystem'] = 'ext4'
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not an NFSv4 mount', result.stderr)
        self.assertFalse(self.state['mounts'])

    def test_refuses_an_existing_mount_of_a_different_directory(self):
        self.state.update(mounted=True, identity='9:9')
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('not a bind', result.stderr)
        self.assertFalse(self.state['mounts'])

    def test_refuses_successful_remount_that_did_not_enforce_the_flag(self):
        self.state['ignore_flag'] = True
        result = self.run_script()
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('lacks nosymfollow', result.stderr)

    def test_rerun_does_not_stack_another_bind(self):
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(self.run_script().returncode, 0)
        self.assertEqual(sum(command[0] == '--bind' for command in self.state['mounts']), 1)

    def test_enabling_setup_installs_a_docker_requirement(self):
        units = self.directory / 'etc/systemd/system'
        units.mkdir(parents=True)
        service = SCRIPT.with_suffix('.service')
        (units / service.name).write_text(service.read_text())
        (units / 'docker.service').write_text('[Service]\nExecStart=/bin/true\n')

        result = subprocess.run(['systemctl', '--root', str(self.directory), 'enable', service.name],
                                capture_output=True, text=True)

        self.assertEqual(result.returncode, 0, result.stderr)
        dependency = units / 'docker.service.requires' / service.name
        self.assertTrue(dependency.is_symlink())
        self.assertEqual(Path(os.readlink(dependency)).name, service.name)


if __name__ == '__main__':
    unittest.main()
