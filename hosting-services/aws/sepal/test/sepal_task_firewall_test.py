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
        self.resolv_conf = os.path.join(self.tmp.name, 'resolv.conf')
        with open(self.resolv_conf, 'w') as f:
            f.write('# Test resolv.conf\nnameserver 172.31.0.2\nnameserver 127.0.0.53\n')

    def tearDown(self):
        self.tmp.cleanup()

    def run_script(self, check_status):
        env = {**os.environ, 'PATH': f'{self.tmp.name}:{os.environ["PATH"]}',
               'IPTABLES_LOG': self.log, 'CHECK_STATUS': str(check_status),
               'RESOLV_CONF': self.resolv_conf}
        subprocess.run(['sh', SCRIPT], check=True, env=env)
        with open(self.log) as f:
            return [line.split() for line in f.read().splitlines()]

    def inserted(self, calls):
        return [call for call in calls if '-I' in call]

    def test_lets_task_containers_reach_their_own_network_before_any_drop(self):
        # -I inserts at position 1 (the top), so the rule inserted last evaluates first.
        # Simulate the final chain order: each insertion prepends the rule.
        calls = self.inserted(self.run_script(check_status=1))
        docker_user_calls = [call for call in calls if 'DOCKER-USER' in call]
        # Simulate -I: reverse order (last inserted is first in the chain)
        chain_order = list(reversed(docker_user_calls))
        # First rule in the chain should be the own-subnet RETURN
        self.assertIsNotNone(chain_order)
        first_rule = chain_order[0]
        self.assertEqual(SUBNET, first_rule[first_rule.index('-d') + 1])
        self.assertEqual('RETURN', first_rule[first_rule.index('-j') + 1])

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

    def test_allows_task_containers_to_reach_nameservers_from_resolv_conf(self):
        calls = self.inserted(self.run_script(check_status=1))
        dns_rules = [call for call in calls if 'DOCKER-USER' in call and '--dport' in call and '53' in call]
        self.assertTrue(len(dns_rules) > 0, "DNS rules should be present")
        # Should have rules for 172.31.0.2 but not for 127.0.0.53
        ns_ips = {call[call.index('-d') + 1] for call in dns_rules}
        self.assertIn('172.31.0.2', ns_ips)
        self.assertNotIn('127.0.0.53', ns_ips)

    def test_dns_rules_end_above_drop_rules(self):
        calls = self.inserted(self.run_script(check_status=1))
        docker_user_calls = [i for i, call in enumerate(calls) if 'DOCKER-USER' in call]
        self.assertTrue(len(docker_user_calls) > 0, "Should have DOCKER-USER rules")

        dns_rules_indices = [i for i in docker_user_calls if calls[i][-1] == 'RETURN' and '--dport' in calls[i]]
        drop_rules_indices = [i for i in docker_user_calls if calls[i][-1] == 'DROP' and '--dport' not in calls[i]]

        self.assertTrue(len(dns_rules_indices) > 0, "Should have DNS rules")
        self.assertTrue(len(drop_rules_indices) > 0, "Should have DROP rules")

        # -I inserts at position 1, so rules inserted later end up earlier in the chain.
        # DNS rules must be inserted AFTER DROP rules so they are evaluated BEFORE DROP rules.
        self.assertTrue(min(dns_rules_indices) > max(drop_rules_indices),
                        "DNS rules must be inserted after DROP rules (higher indices)")

        # Verify final chain order: simulate -I insertion (reverse order = chain order)
        docker_user_insert_order = [call for call in calls if 'DOCKER-USER' in call]
        chain_order = list(reversed(docker_user_insert_order))

        # Find positions in the chain
        dns_positions = [i for i, call in enumerate(chain_order) if call[-1] == 'RETURN' and '--dport' in call]
        drop_positions = [i for i, call in enumerate(chain_order) if call[-1] == 'DROP' and '--dport' not in call]

        if dns_positions and drop_positions:
            # DNS rules should come before (lower position index) DROP rules in the chain
            self.assertTrue(max(dns_positions) < min(drop_positions),
                            "DNS rules should evaluate before DROP rules in the final chain")


if __name__ == '__main__':
    unittest.main()
