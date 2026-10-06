import os
import stat
import subprocess
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docker', 'sepal-task-firewall.sh')
SUBNET = '172.29.0.0/16'
BLOCKED = ['169.254.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8']

FAKE_IPTABLES = '''#!/bin/sh
echo "$@" >> "$IPTABLES_LOG"
case " $* " in
  *" -C "*) exit "$CHECK_STATUS" ;;
esac
exit 0
'''


class SepalTaskFirewallTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        fake = os.path.join(self.tmp.name, 'iptables')
        with open(fake, 'w') as f:
            f.write(FAKE_IPTABLES)
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
        self.log = os.path.join(self.tmp.name, 'calls')

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, check_status):
        env = {**os.environ, 'PATH': f'{self.tmp.name}:{os.environ["PATH"]}',
               'IPTABLES_LOG': self.log, 'CHECK_STATUS': str(check_status)}
        subprocess.run(['sh', SCRIPT], check=True, env=env)
        with open(self.log) as f:
            return [line.split() for line in f.read().splitlines()]

    def inserted(self, calls):
        return [call for call in calls if '-I' in call]

    def test_lets_task_containers_reach_their_own_network_before_any_drop(self):
        # Each -I inserts at the top, so the rule inserted last is evaluated first.
        calls = self.inserted(self.run_script(check_status=1))
        top = [call for call in calls if 'DOCKER-USER' in call][-1]
        self.assertEqual(SUBNET, top[top.index('-d') + 1])
        self.assertEqual('RETURN', top[top.index('-j') + 1])

    def test_drops_task_traffic_to_the_metadata_service_and_every_private_range(self):
        calls = self.inserted(self.run_script(check_status=1))
        dropped = {call[call.index('-d') + 1] for call in calls
                   if 'DOCKER-USER' in call and call[call.index('-j') + 1] == 'DROP'}
        self.assertEqual(set(BLOCKED), dropped)
        self.assertTrue(all(call[call.index('-s') + 1] == SUBNET for call in calls))

    def test_drops_task_traffic_to_the_host_itself(self):
        calls = self.inserted(self.run_script(check_status=1))
        self.assertIn(['-I', 'INPUT', '-s', SUBNET, '-j', 'DROP'], calls)

    def test_inserts_nothing_when_every_rule_is_present(self):
        self.assertEqual([], self.inserted(self.run_script(check_status=0)))


if __name__ == '__main__':
    unittest.main()
