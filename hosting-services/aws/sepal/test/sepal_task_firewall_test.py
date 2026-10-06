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
sys.exit(status)
'''


class SepalTaskFirewallTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        fake = os.path.join(self.tmp.name, 'iptables')
        with open(fake, 'w') as f:
            f.write(FAKE_IPTABLES)
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
        self.state = os.path.join(self.tmp.name, 'state.json')
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

    def given_chains(self, chains):
        with open(self.state, 'w') as f:
            json.dump(chains, f)

    def given_resolv_conf(self, content):
        with open(self.resolv_conf, 'w') as f:
            f.write(content)

    def run_script(self):
        env = {**os.environ, 'PATH': f'{self.tmp.name}:{os.environ["PATH"]}',
               'IPTABLES_STATE': self.state, 'RESOLV_CONF': self.resolv_conf}
        subprocess.run(['sh', SCRIPT], check=True, env=env)
        with open(self.state) as f:
            return json.load(f)


if __name__ == '__main__':
    unittest.main()
