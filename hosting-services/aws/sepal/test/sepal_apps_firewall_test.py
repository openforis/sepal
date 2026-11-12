import ipaddress
import json
import os
import stat
import subprocess
import tempfile
import unittest

from sepal_task_firewall_test import FAKE_IPTABLES, FAKE_IPTABLES_RESTORE, FAKE_LOGGER

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docker', 'sepal-apps-firewall.sh')
APPS_RANGE = '172.30.128.0/17'
APP_LAUNCHER = '172.30.0.2'
BLOCKED = ['169.254.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8']
NAMESERVER = '172.31.0.2'


class SepalAppsFirewallTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        for name, content in [('iptables', FAKE_IPTABLES), ('iptables-restore', FAKE_IPTABLES_RESTORE),
                              ('modprobe', FAKE_LOGGER), ('sysctl', FAKE_LOGGER)]:
            fake = os.path.join(self.tmp.name, name)
            with open(fake, 'w') as f:
                f.write(content)
            os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
        self.state = os.path.join(self.tmp.name, 'state.json')
        self.history_file = os.path.join(self.tmp.name, 'history.jsonl')
        self.command_log = os.path.join(self.tmp.name, 'commands.log')
        self.resolv_conf = os.path.join(self.tmp.name, 'resolv.conf')
        self.given_chains({'DOCKER-USER': [], 'INPUT': []})
        self.given_resolv_conf(f'# Test resolv.conf\nnameserver {NAMESERVER}\nnameserver 127.0.0.53\nnameserver fd00::2\n')

    def tearDown(self):
        self.tmp.cleanup()

    def test_app_traffic_jumps_to_the_apps_chain_and_is_dropped_from_the_host(self):
        chains = self.run_script()

        self.assertEqual([['-s', APPS_RANGE, '-j', 'SEPAL-APPS']], chains['DOCKER-USER'])
        self.assertEqual([['-s', APPS_RANGE, '-j', 'DROP']], chains['INPUT'])

    def test_the_apps_chain_returns_replies_and_dns_before_dropping_private_ranges(self):
        chains = self.run_script()

        self.assertEqual(
            [['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'RETURN'],
             ['-d', NAMESERVER, '-p', 'udp', '--dport', '53', '-j', 'RETURN'],
             ['-d', NAMESERVER, '-p', 'tcp', '--dport', '53', '-j', 'RETURN']]
            + [['-d', destination, '-j', 'DROP'] for destination in BLOCKED],
            chains['SEPAL-APPS'])

    def test_app_launcher_is_outside_the_filtered_range_and_unreachable_from_it(self):
        chains = self.run_script()

        self.assertFalse(in_network(APP_LAUNCHER, APPS_RANGE))
        self.assertFalse(any('-d' in rule and in_network(APP_LAUNCHER, rule[rule.index('-d') + 1])
                             and 'RETURN' in rule for rule in chains['SEPAL-APPS']))
        self.assertIn(['-d', '172.16.0.0/12', '-j', 'DROP'], chains['SEPAL-APPS'])

    def test_rerunning_rebuilds_the_apps_chain_and_keeps_a_single_jump(self):
        first = self.run_script()
        self.given_resolv_conf('nameserver 10.0.0.2\n')

        second = self.run_script()

        self.assertEqual(first['DOCKER-USER'], second['DOCKER-USER'])
        self.assertEqual(first['INPUT'], second['INPUT'])
        dns = [rule for rule in second['SEPAL-APPS'] if '53' in rule]
        self.assertEqual({'10.0.0.2'}, {rule[rule.index('-d') + 1] for rule in dns})

    def test_the_task_firewall_rules_on_the_same_host_are_kept(self):
        task_jump = ['-s', '172.29.128.0/17', '-j', 'SEPAL-TASK']
        self.given_chains({'DOCKER-USER': [task_jump], 'INPUT': []})

        chains = self.run_script()

        self.assertIn(task_jump, chains['DOCKER-USER'])

    def test_a_rerun_never_leaves_app_traffic_without_its_drops(self):
        self.run_script()
        self.reset_history()

        self.run_script()

        snapshots = self.history()
        self.assertTrue(any(['-s', APPS_RANGE, '-j', 'SEPAL-APPS'] in chains.get('DOCKER-USER', [])
                            for chains in snapshots))
        for chains in snapshots:
            if ['-s', APPS_RANGE, '-j', 'SEPAL-APPS'] in chains.get('DOCKER-USER', []):
                for destination in BLOCKED:
                    self.assertIn(['-d', destination, '-j', 'DROP'], chains['SEPAL-APPS'])

    def test_bridged_traffic_passes_through_iptables(self):
        self.run_script()

        self.assertIn('modprobe br_netfilter', self.commands())
        self.assertIn('sysctl -q -w net.bridge.bridge-nf-call-iptables=1', self.commands())

    def test_a_failing_bridge_filter_setup_fails_the_run_but_leaves_the_rules_in_place(self):
        self.given_command_fails('modprobe')

        result = self.run_script(check=False)

        self.assertNotEqual(0, result.returncode)
        chains = self.state_chains()
        self.assertEqual([['-s', APPS_RANGE, '-j', 'SEPAL-APPS']], chains['DOCKER-USER'])
        self.assertEqual([['-s', APPS_RANGE, '-j', 'DROP']], chains['INPUT'])
        for destination in BLOCKED:
            self.assertIn(['-d', destination, '-j', 'DROP'], chains['SEPAL-APPS'])

    def given_command_fails(self, name):
        with open(os.path.join(self.tmp.name, name), 'w') as f:
            f.write('#!/bin/sh\nexit 1\n')

    def given_chains(self, chains):
        with open(self.state, 'w') as f:
            json.dump(chains, f)

    def given_resolv_conf(self, content):
        with open(self.resolv_conf, 'w') as f:
            f.write(content)

    def state_chains(self):
        with open(self.state) as f:
            return json.load(f)

    def reset_history(self):
        if os.path.exists(self.history_file):
            os.remove(self.history_file)

    def history(self):
        with open(self.history_file) as f:
            return [json.loads(line) for line in f]

    def commands(self):
        if not os.path.exists(self.command_log):
            return []
        with open(self.command_log) as f:
            return f.read().splitlines()

    def run_script(self, check=True):
        env = {**os.environ, 'PATH': f'{self.tmp.name}:{os.environ["PATH"]}',
               'IPTABLES_STATE': self.state, 'IPTABLES_HISTORY': self.history_file,
               'COMMAND_LOG': self.command_log, 'RESOLV_CONF': self.resolv_conf}
        result = subprocess.run(['sh', SCRIPT], check=check, env=env)
        return self.state_chains() if check else result


def in_network(address, network):
    return ipaddress.ip_address(address) in ipaddress.ip_network(network)


if __name__ == '__main__':
    unittest.main()
