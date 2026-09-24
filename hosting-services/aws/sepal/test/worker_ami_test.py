import os
import sys
import tempfile
import types
import unittest
from unittest import mock

# Importing must not leave a __pycache__ in worker-ami/, whose every file is a hash input.
sys.dont_write_bytecode = True
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'worker-ami'))

import worker_ami  # noqa: E402

VERSION = '1938'


class ContentHashTest(unittest.TestCase):

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.worker_ami_dir = os.path.join(self.tmp.name, 'worker-ami')
        write(self.worker_ami_dir, 'packer.json', '{}')
        write(self.worker_ami_dir, 'docker/worker-daemon.json', '{"runtimes": {}}')
        self.registry_certificate = write(self.tmp.name, 'docker-registry.crt', 'certificate')
        self.registry = Registry({'sandbox': manifest('sha256:sandbox'), 'task': manifest('sha256:task')})
        self.env = {name: f'{name.lower()}-value' for name in worker_ami.ENV_NAMES}

    def tearDown(self):
        self.tmp.cleanup()

    def hash(self, **overrides):
        return worker_ami.content_hash(VERSION, **{
            'fetch_manifest': self.registry.fetch_manifest,
            'env': self.env,
            'worker_ami_dir': self.worker_ami_dir,
            'registry_certificate': self.registry_certificate,
            **overrides,
        })

    def test_same_inputs_give_the_same_hash(self):
        self.assertEqual(self.hash(), self.hash())

    def test_reads_the_images_of_the_given_version(self):
        self.hash()

        self.assertEqual(self.registry.references, [('sandbox', VERSION), ('task', VERSION)])

    def test_a_different_sandbox_image_changes_the_hash(self):
        before = self.hash()
        self.registry.images['sandbox'] = manifest('sha256:other-sandbox')

        self.assertNotEqual(self.hash(), before)

    def test_a_different_task_image_changes_the_hash(self):
        before = self.hash()
        self.registry.images['task'] = manifest('sha256:other-task')

        self.assertNotEqual(self.hash(), before)

    def test_a_changed_file_changes_the_hash(self):
        before = self.hash()
        write(self.worker_ami_dir, 'docker/worker-daemon.json', '{"runtimes": {"nvidia": {}}}')

        self.assertNotEqual(self.hash(), before)

    def test_an_added_file_changes_the_hash(self):
        before = self.hash()
        write(self.worker_ami_dir, 'gpu/install-gpu-drivers.sh', '#!/bin/sh')

        self.assertNotEqual(self.hash(), before)

    def test_bytecode_caches_and_hidden_files_do_not_change_the_hash(self):
        before = self.hash()
        write(self.worker_ami_dir, '__pycache__/worker_ami.cpython-311.pyc', 'bytecode')
        write(self.worker_ami_dir, '.worker-ami.yml.swp', 'editor state')

        self.assertEqual(self.hash(), before)

    def test_a_different_registry_certificate_changes_the_hash(self):
        before = self.hash()
        write(self.tmp.name, 'docker-registry.crt', 'renewed certificate')

        self.assertNotEqual(self.hash(), before)

    def test_each_baked_in_env_value_changes_the_hash(self):
        before = self.hash()
        for name in worker_ami.ENV_NAMES:
            with self.subTest(name=name):
                self.assertNotEqual(self.hash(env={**self.env, name: 'changed'}), before)

    def test_other_env_values_do_not_change_the_hash(self):
        before = self.hash()

        self.assertEqual(self.hash(env={**self.env, 'DOCKER_REGISTRY_PASSWORD': 'rotated'}), before)

    def test_an_index_resolves_to_its_linux_amd64_image(self):
        before = self.hash()
        self.registry.images['sandbox'] = index(
            ('sha256:attestation', {'os': 'unknown', 'architecture': 'unknown'}),
            ('sha256:sandbox-amd64', {'os': 'linux', 'architecture': 'amd64'}),
        )
        self.registry.images['sha256:sandbox-amd64'] = manifest('sha256:sandbox')

        self.assertEqual(self.hash(), before)

    def test_an_index_without_a_linux_amd64_image_is_an_error(self):
        self.registry.images['sandbox'] = index(('sha256:arm64', {'os': 'linux', 'architecture': 'arm64'}))

        with self.assertRaisesRegex(worker_ami.WorkerAmiError, 'no linux/amd64 image'):
            self.hash()


class AmiVersionTest(unittest.TestCase):

    def test_is_none_without_a_matching_ami(self):
        self.assertIsNone(worker_ami.ami_version(Ec2([]), 'hash', 'eu-west-1'))

    def test_is_the_version_of_the_newest_matching_ami(self):
        ec2 = Ec2([
            ami(version='1937', created='2026-09-20T10:00:00.000Z'),
            ami(version='1945', created='2026-09-24T10:00:00.000Z'),
            ami(version='1940', created='2026-09-22T10:00:00.000Z'),
        ])

        self.assertEqual(worker_ami.ami_version(ec2, 'hash', 'eu-west-1'), '1945')

    def test_considers_only_own_available_amis_with_the_hash_in_the_region(self):
        ec2 = Ec2([])

        worker_ami.ami_version(ec2, 'the-hash', 'eu-west-1')

        self.assertEqual(ec2.requests, [{
            'Owners': ['self'],
            'Filters': [
                {'Name': 'tag:ContentHash', 'Values': ['the-hash']},
                {'Name': 'tag:Region', 'Values': ['eu-west-1']},
                {'Name': 'state', 'Values': ['available']},
            ],
        }])


class RegistryManifestFetcherTest(unittest.TestCase):

    def test_asks_for_the_image_manifest_with_basic_auth(self):
        fetch_manifest, requests = fetcher_answering(Response(200, manifest('sha256:sandbox')))

        fetched = fetch_manifest('sandbox', VERSION)

        self.assertEqual(fetched, manifest('sha256:sandbox'))
        url, options = requests.calls[0]
        self.assertEqual(url, f'https://registry.example/v2/openforis/sandbox/manifests/{VERSION}')
        self.assertEqual(options['auth'], ('user', 'secret'))
        for media_type in worker_ami.MANIFEST_TYPES:
            self.assertIn(media_type, options['headers']['Accept'])

    def test_a_missing_image_is_an_error_naming_it(self):
        fetch_manifest, _ = fetcher_answering(Response(404, {}))

        with self.assertRaisesRegex(worker_ami.WorkerAmiError, f'registry.example/openforis/sandbox:{VERSION} is not in the registry'):
            fetch_manifest('sandbox', VERSION)

    def test_a_rejected_request_is_an_error_naming_the_status(self):
        fetch_manifest, _ = fetcher_answering(Response(401, {}))

        with self.assertRaisesRegex(worker_ami.WorkerAmiError, 'answered HTTP 401'):
            fetch_manifest('sandbox', VERSION)

    def test_an_unreachable_registry_is_an_error(self):
        fetch_manifest, _ = fetcher_answering(FakeRequests.RequestException('connection refused'))

        with self.assertRaisesRegex(worker_ami.WorkerAmiError, 'Cannot reach registry registry.example'):
            fetch_manifest('sandbox', VERSION)


class Registry:
    """Serves manifests by image name, or by digest for the entries of an index."""

    def __init__(self, images):
        self.images = images
        self.references = []

    def fetch_manifest(self, image, reference):
        self.references.append((image, reference))
        return self.images[reference if reference.startswith('sha256:') else image]


class Ec2:

    def __init__(self, images):
        self.images = images
        self.requests = []

    def describe_images(self, **request):
        self.requests.append(request)
        return {'Images': self.images}


class FakeRequests(types.ModuleType):
    """Stands in for the requests module, answering every GET with the given response or error."""

    class RequestException(Exception):
        pass

    def __init__(self, outcome):
        super().__init__('requests')
        self.outcome = outcome
        self.calls = []

    def get(self, url, **options):
        self.calls.append((url, options))
        if isinstance(self.outcome, Exception):
            raise self.outcome
        return self.outcome


class Response:

    def __init__(self, status_code, body):
        self.status_code = status_code
        self.body = body

    def json(self):
        return self.body


# The fetcher imports requests when it is created, so the fake only needs to be in place then.
def fetcher_answering(outcome):
    requests = FakeRequests(outcome)
    with mock.patch.dict(sys.modules, {'requests': requests}):
        return worker_ami.registry_manifest_fetcher('registry.example', 'user', 'secret'), requests


def manifest(config_digest):
    return {'mediaType': 'application/vnd.oci.image.manifest.v1+json', 'config': {'digest': config_digest}}


def index(*entries):
    return {
        'mediaType': 'application/vnd.oci.image.index.v1+json',
        'manifests': [{'digest': digest, 'platform': platform} for digest, platform in entries],
    }


def ami(version, created):
    return {'CreationDate': created, 'Tags': [{'Key': 'ContentHash', 'Value': 'hash'}, {'Key': 'Version', 'Value': version}]}


def write(directory, relative_path, content):
    path = os.path.join(directory, relative_path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as file:
        file.write(content)
    return path


if __name__ == '__main__':
    unittest.main()
