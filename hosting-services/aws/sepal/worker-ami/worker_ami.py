#!/usr/bin/env python3
"""Identifies the worker AMI by the content that goes into it.

  worker_ami.py hash <version>   prints the content hash of the worker AMI for a build
  worker_ami.py lookup <hash>    prints the Version tag of the newest available AMI carrying
                                 that hash, or nothing when there is none

The hash covers the sandbox and task image IDs, every file in this directory, the registry
certificate and the environment values the AMI build bakes in. Configuration comes from the
environment the calling script sources from $CONFIG_HOME/env.
"""
import hashlib
import os
import sys

WORKER_AMI_DIR = os.path.dirname(os.path.abspath(__file__))
IMAGES = ['sandbox', 'task']
# The values worker-ami.yml and packer.json bake into the AMI, plus DEPLOY_ENVIRONMENT to keep each
# environment on its own AMIs. A value the AMI build starts reading must be added here.
ENV_NAMES = ['AWS_WORKER_AMI', 'AWS_REGION', 'AWS_EFS_ID', 'AWS_FSX_ID', 'DOCKER_REGISTRY_HOST', 'DEPLOY_ENVIRONMENT']
MANIFEST_TYPES = [
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
]


class WorkerAmiError(Exception):
    pass


def main(argv, env):
    if len(argv) != 3 or argv[1] not in ('hash', 'lookup'):
        sys.exit(__doc__)
    command, argument = argv[1], argv[2]
    try:
        if command == 'hash':
            print(content_hash(
                argument,
                fetch_manifest=registry_manifest_fetcher(
                    env['DOCKER_REGISTRY_HOST'], env['DOCKER_REGISTRY_USERNAME'], env['DOCKER_REGISTRY_PASSWORD']),
                env=env,
                worker_ami_dir=WORKER_AMI_DIR,
                registry_certificate=os.path.join(env['CONFIG_HOME'], 'certificates', 'docker-registry.crt'),
            ))
        else:
            print(ami_version(ec2_client(env['AWS_REGION']), argument, env['AWS_REGION']) or '')
    except WorkerAmiError as e:
        sys.exit(f'Error: {e}')


def content_hash(version, *, fetch_manifest, env, worker_ami_dir, registry_certificate):
    lines = (
        [f'image {image} {image_id(fetch_manifest, image, version)}' for image in IMAGES]
        + [f'file {path} {digest}' for path, digest in file_digests(worker_ami_dir)]
        + [f'file docker-registry.crt {file_digest(registry_certificate)}']
        + [f'env {name}={env.get(name, "")}' for name in ENV_NAMES]
    )
    return hashlib.sha256('\n'.join(lines).encode()).hexdigest()


def ami_version(ec2, content_hash, region):
    images = ec2.describe_images(
        Owners=['self'],
        Filters=[
            {'Name': 'tag:ContentHash', 'Values': [content_hash]},
            {'Name': 'tag:Region', 'Values': [region]},
            {'Name': 'state', 'Values': ['available']},
        ],
    )['Images']
    if not images:
        return None
    newest = max(images, key=lambda image: image['CreationDate'])
    return next(tag['Value'] for tag in newest['Tags'] if tag['Key'] == 'Version')


# The config digest is the image ID. A manifest list or OCI index is resolved to its linux/amd64
# entry, which also skips the attestation manifests BuildKit adds to an index.
def image_id(fetch_manifest, image, reference):
    manifest = fetch_manifest(image, reference)
    if 'manifests' in manifest:
        return image_id(fetch_manifest, image, amd64_digest(manifest, image, reference))
    return manifest['config']['digest']


def amd64_digest(index, image, reference):
    for entry in index['manifests']:
        platform = entry.get('platform', {})
        if platform.get('os') == 'linux' and platform.get('architecture') == 'amd64':
            return entry['digest']
    raise WorkerAmiError(f'openforis/{image}:{reference} has no linux/amd64 image')


# Sorted relative paths make the hash independent of directory listing order; bytecode caches and
# hidden files are left out, as they are not part of the AMI build.
def file_digests(directory):
    digests = []
    for root, dirs, files in os.walk(directory):
        dirs[:] = [d for d in dirs if d != '__pycache__' and not d.startswith('.')]
        for name in files:
            if not name.startswith('.'):
                path = os.path.join(root, name)
                digests.append((os.path.relpath(path, directory).replace(os.sep, '/'), file_digest(path)))
    return sorted(digests)


def file_digest(path):
    with open(path, 'rb') as file:
        return hashlib.sha256(file.read()).hexdigest()


def registry_manifest_fetcher(host, username, password):
    import requests

    def fetch_manifest(image, reference):
        url = f'https://{host}/v2/openforis/{image}/manifests/{reference}'
        try:
            response = requests.get(
                url, auth=(username, password), headers={'Accept': ', '.join(MANIFEST_TYPES)}, timeout=60)
        except requests.RequestException as e:
            raise WorkerAmiError(f'Cannot reach registry {host}: {e}')
        if response.status_code == 404:
            raise WorkerAmiError(f'{host}/openforis/{image}:{reference} is not in the registry')
        if response.status_code != 200:
            raise WorkerAmiError(f'Registry {host} answered HTTP {response.status_code} for openforis/{image}:{reference}')
        return response.json()

    return fetch_manifest


def ec2_client(region):
    import boto3
    return boto3.client('ec2', region_name=region)


if __name__ == '__main__':
    main(sys.argv, os.environ)
