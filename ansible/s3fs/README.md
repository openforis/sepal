# Ansible Role: S3fs

[![Build Status](https://travis-ci.org/Aplyca/ansible-role-s3fs.svg?branch=master)](https://travis-ci.org/Aplyca/ansible-role-s3fs)
[![Circle CI](https://circleci.com/gh/Aplyca/ansible-role-s3fs.svg?style=svg)](https://circleci.com/gh/Aplyca/ansible-role-s3fs)

Ansible Role that installs and configure s3fs on Debian/Ubuntu. Aditionally, install a start/stop script to mount/unmount buckets and add the mountpoints to the fstab file.


## Requirements

Use hash behavior for variables in ansible.cfg
See example: https://github.com/Aplyca/ansible-role-s3fs/blob/master/tests/ansible.cfg
See official docs: http://docs.ansible.com/intro_configuration.html#hash-behaviour

## Installation

Using ansible galaxy:
```bash
ansible-galaxy install Aplyca.S3fs
```
You can add this role as a dependency for other roles, add the role to the meta/main.yml file of your own role:
```yaml
dependencies:
  - { role: Aplyca.S3fs }
```

Use `merge` hash behaviour for variables like dictionaries in Python. You can set this configuration by adding the setting `hash_behaviour=merge` to the `ansible.cfg` file which should be placed in the same directory where you are executing ansible-playbook command. See the docs for more info: http://docs.ansible.com/ansible/intro_configuration.html#hash-behaviour or see the example here: https://github.com/Aplyca/ansible-role-s3fs/blob/master/ansible.cfg

## Role Variables

See default variables: https://github.com/Aplyca/ansible-role-s3fs/blob/master/defaults/main.yml

```yaml
s3fs:
  buckets:
    - mountpoint: /mnt/s3fs
      bucket: s3fs
      accessKeyId: "accessKeyId"
      secretAccessKey: "secretAccessKey"
      options: "allow_other,use_cache=/tmp,max_stat_cache_size=100000,uid=33,gid=33,umask=002"
```

## Dependencies

None.

## Testing

### Vagrant
* You can use Vagrant to set up and provision a VM in order to run tests.
* To know more about Vagrant: http://www.vagrantup.com
  And Vagrant with Ansible: http://docs.vagrantup.com/v2/provisioning/ansible.html

```bash
tests/vagrant.sh
```
### Docker

```bash
tests/docker.sh
```

License
-------

MIT / BSD

Author Information
------------------

Mauricio Sánchez from Aplyca SAS (http://www.aplyca.com)
