import json
import os
import stat
import subprocess
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'docker', 'sepal-task-firewall.sh')
TASK_RANGE = '172.29.128.0/17'
LEGACY_SUBNET = '172.29.0.0/16'
GATEWAY = '172.29.0.2'
BLOCKED = ['169.254.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '192.168.0.0/16', '100.64.0.0/10', '127.0.0.0/8']
NAMESERVER = '172.31.0.2'

# A stateful iptables: chains are lists of rules (argument lists), -I prepends, -A appends,
# -C/-D match a rule by its exact arguments.
FAKE_IPTABLES = '''#!/usr/bin/env python3
import json, os, sys
state_file = os.environ['IPTABLES_STATE']
with open(state_file) as f:
    chains = json.load(f)
command, chain, *rule = sys.argv[1:]
status = 0
if command == '-N':
    if chain in chains:
        status = 1
    else:
        chains[chain] = []
elif command == '-F':
    chains[chain] = []
elif command == '-A':
    chains[chain].append(rule)
elif command == '-I':
    chains[chain].insert(0, rule)
elif command == '-C':
    status = 0 if rule in chains.get(chain, []) else 1
elif command == '-D':
    if rule in chains.get(chain, []):
        chains[chain].remove(rule)
    else:
        status = 1
else:
    status = 2
with open(state_file, 'w') as f:
    json.dump(chains, f)
with open(os.environ['IPTABLES_HISTORY'], 'a') as f:
    f.write(json.dumps(chains) + '\\n')
sys.exit(status)
'''

# Applies a '*filter ... COMMIT' ruleset in one step: declared chains are created or flushed, then rules appended.
FAKE_IPTABLES_RESTORE = '''#!/usr/bin/env python3
import json, os, sys
assert sys.argv[1:] == ['--noflush'], sys.argv
state_file = os.environ['IPTABLES_STATE']
with open(state_file) as f:
    chains = json.load(f)
for line in sys.stdin.read().splitlines():
    if line.startswith(':'):
        chains[line[1:].split()[0]] = []
    elif line.startswith('-A '):
        _, chain, *rule = line.split()
        chains[chain].append(rule)
with open(state_file, 'w') as f:
    json.dump(chains, f)
with open(os.environ['IPTABLES_HISTORY'], 'a') as f:
    f.write(json.dumps(chains) + '\\n')
'''

FAKE_LOGGER = '''#!/bin/sh
echo "$(basename "$0") $*" >> "$COMMAND_LOG"
'''


class SepalTaskFirewallTest(unittest.TestCase):

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

    def test_task_traffic_jumps_to_the_task_chain_and_is_dropped_from_the_host(self):
        chains = self.run_script()

        self.assertEqual([['-s', TASK_RANGE, '-j', 'SEPAL-TASK']], chains['DOCKER-USER'])
        self.assertEqual([['-s', TASK_RANGE, '-j', 'DROP']], chains['INPUT'])

    def test_the_task_chain_returns_replies_gateway_http_and_dns_before_dropping_private_ranges(self):
        chains = self.run_script()

        self.assertEqual(
            [['-m', 'conntrack', '--ctstate', 'ESTABLISHED,RELATED', '-j', 'RETURN'],
             ['-d', GATEWAY, '-p', 'tcp', '--dport', '80', '-j', 'RETURN'],
             ['-d', NAMESERVER, '-p', 'udp', '--dport', '53', '-j', 'RETURN'],
             ['-d', NAMESERVER, '-p', 'tcp', '--dport', '53', '-j', 'RETURN']]
            + [['-d', destination, '-j', 'DROP'] for destination in BLOCKED],
            chains['SEPAL-TASK'])

    def test_rerunning_rebuilds_the_task_chain_and_keeps_a_single_jump(self):
        first = self.run_script()
        self.given_resolv_conf('nameserver 10.0.0.2\n')

        second = self.run_script()

        self.assertEqual(first['DOCKER-USER'], second['DOCKER-USER'])
        self.assertEqual(first['INPUT'], second['INPUT'])
        dns = [rule for rule in second['SEPAL-TASK'] if '53' in rule]
        self.assertEqual({'10.0.0.2'}, {rule[rule.index('-d') + 1] for rule in dns})

    def test_rules_an_earlier_version_put_directly_in_docker_user_are_removed(self):
        legacy = ([['-s', LEGACY_SUBNET, '-d', LEGACY_SUBNET, '-j', 'RETURN']]
                  + [['-s', LEGACY_SUBNET, '-d', NAMESERVER, '-p', protocol, '--dport', '53', '-j', 'RETURN']
                     for protocol in ['tcp', 'udp']]
                  + [['-s', LEGACY_SUBNET, '-d', destination, '-j', 'DROP'] for destination in BLOCKED])
        unrelated = ['-s', '10.1.0.0/16', '-j', 'RETURN']
        self.given_chains({
            'DOCKER-USER': legacy + legacy[:1] + [unrelated],
            'INPUT': [['-s', LEGACY_SUBNET, '-j', 'DROP']]
        })

        chains = self.run_script()

        self.assertEqual([['-s', TASK_RANGE, '-j', 'SEPAL-TASK'], unrelated], chains['DOCKER-USER'])
        self.assertEqual([['-s', TASK_RANGE, '-j', 'DROP']], chains['INPUT'])

    def test_without_resolv_conf_no_nameserver_is_allowed(self):
        os.remove(self.resolv_conf)

        chains = self.run_script()

        self.assertEqual([], [rule for rule in chains['SEPAL-TASK'] if '--dport' in rule and '53' in rule])

    def test_a_rerun_never_leaves_task_traffic_without_its_drops(self):
        self.run_script()
        self.reset_history()

        self.run_script()

        snapshots = self.history()
        self.assertTrue(any(['-s', TASK_RANGE, '-j', 'SEPAL-TASK'] in chains.get('DOCKER-USER', [])
                            for chains in snapshots))
        for chains in snapshots:
            if ['-s', TASK_RANGE, '-j', 'SEPAL-TASK'] in chains.get('DOCKER-USER', []):
                for destination in BLOCKED:
                    self.assertIn(['-d', destination, '-j', 'DROP'], chains['SEPAL-TASK'])

    def test_bridged_traffic_passes_through_iptables(self):
        self.run_script()

        self.assertIn('modprobe br_netfilter', self.commands())
        self.assertIn('sysctl -q -w net.bridge.bridge-nf-call-iptables=1', self.commands())

    def test_a_failing_bridge_filter_setup_fails_the_run_but_leaves_the_rules_in_place(self):
        self.given_command_fails('modprobe')

        result = self.run_script(check=False)

        self.assertNotEqual(0, result.returncode)
        chains = self.state_chains()
        self.assertEqual([['-s', TASK_RANGE, '-j', 'SEPAL-TASK']], chains['DOCKER-USER'])
        self.assertEqual([['-s', TASK_RANGE, '-j', 'DROP']], chains['INPUT'])
        for destination in BLOCKED:
            self.assertIn(['-d', destination, '-j', 'DROP'], chains['SEPAL-TASK'])

    def given_command_fails(self, name):
        with open(os.path.join(self.tmp.name, name), 'w') as f:
            f.write('#!/bin/sh\nexit 1\n')

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

    def given_chains(self, chains):
        with open(self.state, 'w') as f:
            json.dump(chains, f)

    def given_resolv_conf(self, content):
        with open(self.resolv_conf, 'w') as f:
            f.write(content)

    def run_script(self, check=True):
        env = {**os.environ, 'PATH': f'{self.tmp.name}:{os.environ["PATH"]}',
               'IPTABLES_STATE': self.state, 'IPTABLES_HISTORY': self.history_file,
               'COMMAND_LOG': self.command_log, 'RESOLV_CONF': self.resolv_conf}
        result = subprocess.run(['sh', SCRIPT], check=check, env=env)
        return self.state_chains() if check else result


if __name__ == '__main__':
    unittest.main()
