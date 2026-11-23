import hashlib
import json
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'script'))
from registry_cleanup import CleanupError, plan_cleanup


class RetentionTest(unittest.TestCase):
    def setUp(self):
        self.registry = RegistryFixture()
        self.refs = {}
        self.repositories = ['openforis/gui', 'openforis/gateway']
        for build in ('1', '2', '3', '4', '5-test', '6-test', '7-test', '8-test'):
            self.refs['build-' + build] = build
            for repo in self.repositories:
                self.registry.add(repo, build)
        for env, builds in (('prod', ('1', '2')), ('test', ('5-test', '6-test'))):
            for day, build in enumerate(builds, 1):
                self.refs[f'deployed/{env}/202611{day:02d}T000000Z/{build}'] = build

    def plan(self):
        return plan_cleanup(self.registry, self.refs, lambda commit: self.repositories)

    def test_keeps_two_distinct_deployments_and_three_builds_per_job(self):
        self.refs['deployed/prod/20261103T000000Z/2'] = '2'
        plan = self.plan()
        self.assertTrue(plan.enabled)
        self.assertEqual(plan.protected, {'1', '2', '3', '4', '5-test', '6-test', '7-test', '8-test'})
        self.assertEqual(plan.delete, ())

    def test_old_builds_are_removed_but_shared_manifests_are_only_untagged(self):
        self.refs['build-0'] = '0'
        shared = self.registry.tags['openforis/gui', '1']
        self.registry.tags['openforis/gui', '0'] = shared
        old = self.registry.add('openforis/gateway', '0')
        plan = self.plan()
        self.assertEqual(plan.delete, (('openforis/gateway', old),))
        self.assertEqual(plan.untag, (('openforis/gui', '0'),))

    def test_missing_or_partial_deployments_disable_deletion(self):
        del self.registry.tags['openforis/gui', '1']
        self.assertFalse(self.plan().enabled)
        del self.registry.tags['openforis/gateway', '1']
        self.assertFalse(self.plan().enabled)

    def test_wholly_absent_old_hotfix_does_not_block(self):
        self.refs['build-1-hotfix'] = 'absent'
        self.assertTrue(self.plan().enabled)

    def test_partial_old_hotfix_blocks(self):
        self.refs['build-1-hotfix'] = 'partial'
        self.registry.add('openforis/gui', '1-hotfix')
        self.assertFalse(self.plan().enabled)

    def test_keeps_children_of_indexes_even_if_they_have_no_tag(self):
        child = self.registry.add('openforis/gui', 'temporary')
        del self.registry.tags['openforis/gui', 'temporary']
        self.registry.add('openforis/gui', '1', [child])
        self.assertNotIn(('openforis/gui', child), self.plan().delete)

    def test_unprotected_children_are_deleted_before_their_parent(self):
        child = self.registry.add('openforis/gui', 'temporary')
        del self.registry.tags['openforis/gui', 'temporary']
        parent = self.registry.add('openforis/gui', '0', [child])
        self.assertEqual(self.plan().delete, (('openforis/gui', child), ('openforis/gui', parent)))

    def test_an_interrupted_old_index_removal_can_be_finished(self):
        child = self.registry.add('openforis/gui', 'temporary')
        del self.registry.tags['openforis/gui', 'temporary']
        parent = self.registry.add('openforis/gui', '0', [child])
        del self.registry.manifests['openforis/gui', child]
        self.assertEqual(self.plan().delete, (('openforis/gui', parent),))

    def test_missing_protected_child_disables_deletion(self):
        self.registry.add('openforis/gui', '1', ['sha256:' + '0' * 64])
        self.assertFalse(self.plan().enabled)

    def test_other_namespaces_are_untouched(self):
        self.registry.add('unrelated/image', '0')
        self.assertEqual(self.plan().delete, ())

    def test_failed_lookup_is_not_treated_as_absent(self):
        self.registry.fail = True
        with self.assertRaises(CleanupError):
            self.plan()

    def test_a_malformed_deployment_record_is_rejected(self):
        self.refs['deployed/prod/not-a-date/4'] = '4'
        with self.assertRaises(CleanupError):
            self.plan()


class RegistryFixture:
    def __init__(self):
        self.tags = {}
        self.manifests = {}
        self.fail = False

    def add(self, repo, tag, children=()):
        body = {'name': repo + ':' + tag, 'manifests': [{'digest': c} for c in children]}
        digest = 'sha256:' + hashlib.sha256(json.dumps(body).encode()).hexdigest()
        self.tags[repo, tag] = digest
        self.manifests[repo, digest] = body
        return digest

    def repositories(self):
        return sorted({r for r, _ in self.tags})

    def tag_names(self, repo):
        return sorted(t for r, t in self.tags if r == repo)

    def manifest(self, repo, reference):
        if self.fail:
            raise CleanupError('registry unavailable')
        digest = self.tags.get((repo, reference), reference)
        body = self.manifests.get((repo, digest))
        return (digest, body) if body is not None else None
