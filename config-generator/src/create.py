import getpass
import json
import os
import random
import string
import subprocess
from collections import OrderedDict
from os.path import dirname

import errno
import sys

print "******************************"
print "*** Sepal Config Generator ***"
print "******************************"

user_id = sys.argv[1]
config_home = sys.argv[2]
config = OrderedDict()

print 'CONFIG_HOME=' + config_home


def is_int(s):
    try:
        int(s)
        return True
    except ValueError:
        return False


def _mkdir_p(path):
    try:
        os.makedirs(path)
    except OSError as exc:  # Python >2.5
        if exc.errno == errno.EEXIST and os.path.isdir(path):
            pass
        else:
            raise


def _parent_mkdirs(path):
    _mkdir_p(dirname(config_home + '/' + path))


def _read_lines():
    lines = ''
    while True:
        line = raw_input()
        if not line:
            break
        lines = lines + line + '\r\n'
    return lines


def _option(key, label, *options):
    options_text = ', '.join('{}: {}'.format(idx + 1, option[1]) for idx, option in enumerate(options))
    response = raw_input(str(label) + ' (' + options_text + '): ')
    if is_int(response) and 0 <= int(response) <= len(options):
        config[key] = options[int(response) - 1][0]
    else:
        print "Invalid option!"
        _option(key, label, *options)


def _text(key, label):
    response = raw_input(label + ': ')
    if response:
        config[key] = response
    else:
        print "Must be specified!"
        _text(key, label)


def _password(key, label, no_default=False):
    if no_default:
        response = getpass.getpass(label + ': ')
    else:
        response = getpass.getpass(label + '(leave empty for random password): ')
    if response:
        config[key] = response
    elif no_default:
        print "Value required!"
        _password(key, label, no_default)
    else:
        _random_password(key, 16)


def _google_earth_engine():
    try:
        print('Google Earth Engine Json contents (enter blank line to complete):')
        lines = _read_lines()
        gee_json = json.loads(lines)
        config['google_earth_engine_account'] = gee_json['client_email']
        config['google_earth_engine_private_key'] = gee_json['private_key'].replace('\n', '\\n').replace('\r' '')
    except ValueError:
        print ('Invalid JSON!')
        _google_earth_engine()


def _random_password(key, length):
    config[key] = ''.join(
        random.SystemRandom().choice(string.lowercase + string.uppercase + string.digits) for _ in range(length)
    )


def _create_aws_key_export_script():
    path = config_home + '/export_aws_keys.sh'
    file = open(path, 'w+')
    file.write("export AWS_ACCESS_KEY_ID='" + config['aws_access_key_id'] + "'\r\n")
    file.write("export AWS_SECRET_ACCESS_KEY='" + config['aws_secret_access_key'] + "'\r\n")
    os.chmod(path, 500)


def _config_aws():
    _text('ami', 'Sepal Server AMI')
    _text('worker_instance_ami', 'Worker instance AMI')
    _text('aws_access_key_id', 'AWS Access Key ID')
    _password('aws_secret_access_key', 'AWS Secret Access Key', 'required')
    _text('region', 'AWS region')
    _text('availability_zone', 'AWS availability zone')
    _text('efs_id', 'AWS EFS id')
    _create_aws_key_export_script()


def _config_vagrant():
    _config_ops()
    _config_sepal()


def _config_sepal():
    _random_password('mysql_root_password', 16)
    _random_password('mysql_password', 16)
    _random_password('gate_one_secret', 32)
    _random_password('gate_one_public', 32)
    _text('sepal_host', 'Sepal Host')
    _password('sepal_admin_user_password', 'Sepal admin user password')
    _random_password('sepal_machine_admin_password', 32)
    _random_password('ldap_admin_password', 32)

    _google_earth_engine()

    _text('google_maps_api_key', 'Google Maps API key')
    _text('smtp_from', 'Sepal email address (used as from when sending emails)')
    _text('smtp_host', 'SMTP server host')
    _text('smtp_port', 'SMTP server port')
    _text('smtp_username', 'SMTP server username')
    _password('smtp_password', 'SMTP server password', 'required')
    _text('elk_host', 'ELK stack host')
    _certificate('certificates/sepal-https.ca-bundle', 'HTTPS CA bundle')
    _certificate('certificates/sepal-https.crt', 'HTTPS certificate')
    _certificate('certificates/sepal-https.key', 'HTTPS key')
    _certificate('certificates/aws.pem', 'AWS pem')
    _certificate('certificates/docker-registry.crt', 'Docker registry certificate')
    _certificate('certificates/elk-client.crt', 'ELK client certificate')
    _certificate('certificates/elk-client.key', 'ELK client key')
    # _create_key_pair('certificates/ldap-crt.pem', 'certificates/ldap-key.pem', '/O=SEPAL/CN=ldap')
    # TODO: LDAP - CA and key pair


def _config_ops():
    _text('host', 'Operations server host')
    _text('jenkins_password', 'Jenkins password')
    _text('jenkins_github_user_password', 'GitHub password')
    _create_key_pair('certificates/docker-registry.crt', 'certificates/docker-registry.key',
                     '/O=SEPAL/CN=' + config['host'])
    _create_key_pair('certificates/elk-client.crt', 'certificates/elk-client.key', '/CN=*.elk')
    _create_key_pair('certificates/elk.crt', 'certificates/elk.key', '/CN=*.elk')


def _config_aws_sepal():
    _text('docker_repository_host', 'Docker repository host')
    _text('docker_username', 'Docker username')
    _text('docker_email', 'Docker user email')
    _password('docker_password', 'Docker password', 'required')


def _certificate(path, label):
    _parent_mkdirs(path)
    certificate = open(config_home + '/' + path, 'w+')
    print(label + ' (paste contents, enter blank line to complete):')
    certificate.write(_read_lines())


def _create_key_pair(crt_path, key_path, subject):
    _parent_mkdirs(crt_path)
    _parent_mkdirs(key_path)
    command = 'openssl ' \
              'req -newkey rsa:4096 -nodes -sha256' \
              ' -keyout ' + config_home + '/' + key_path + \
              ' -x509 -days 3650 -subj "' + subject + '" -out ' + \
              config_home + '/' + crt_path + ' -days 3650'
    subprocess.Popen(command, shell=True).communicate()


try:
    _option(
        'deployment_type',
        'Deployment type',
        ('sepal', 'Sepal'),
        ('ops', 'Operations server')
    )

    _option(
        'hosting_service',
        'Hosting service',
        ('aws', 'AWS'),
        ('vagrant', 'Vagrant')
    )

    _text('deploy_environment', 'Deployment environment')

    if config['hosting_service'] == 'aws':
        _config_aws()

        if config['deployment_type'] == 'sepal':
            _config_sepal()
            _config_aws_sepal()

    elif config['hosting_service'] == 'vagrant':
        _config_vagrant()

    config['restore_backup'] = 'false'
    _mkdir_p(config_home)
    config_file = open(config_home + '/secret.yml', 'w+')
    for key, val in config.items():
        config_file.write(key + ': \'' + val + '\'\n')

    subprocess.Popen('sudo chown -R ' + user_id + ' /config', shell=True).communicate()
    subprocess.Popen('sudo chmod -R 600 /config/*', shell=True).communicate()

except (KeyboardInterrupt, SystemExit):
    print('\nAborting')
