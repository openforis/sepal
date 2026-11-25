"""The seeded Jenkins job of the weekly clean build: Sepal-test's job for dev, but disabled, scheduled and clean."""
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

JOBS = Path(__file__).resolve().parent.parent / 'config' / 'jobs'
# The settings the weekly job has of its own, by their paths in the job configuration
WEEKLY = {
    'disabled': 'true',
    'triggers/hudson.triggers.TimerTrigger/spec': 'TZ=UTC\nH 2 * * 6',
    'builders/hudson.tasks.Shell/command': 'sepal-build "${BUILD_NUMBER}-weekly" --clean',
    'publishers/hudson.plugins.git.GitPublisher/tagsToPush/hudson.plugins.git.GitPublisher_-TagToPush/tagName':
        'build-${BUILD_NUMBER}-weekly',
    './/hudson.model.BooleanParameterDefinition[name="SKIP_TESTS"]/defaultValue': 'false',
}
OWN = ['description', 'triggers', './/hudson.model.BooleanParameterDefinition[name="SKIP_TESTS"]/description']


class WeeklyJobTest(unittest.TestCase):
    def test_weekly_job_is_a_disabled_scheduled_clean_build_with_its_own_tag(self):
        weekly = job('Sepal-weekly')
        self.assertEqual({path: weekly.findtext(path) for path in WEEKLY}, WEEKLY)

    def test_weekly_job_builds_dev_as_sepal_test_does_with_the_same_logs_retention_and_tag_publishing(self):
        weekly, test = job('Sepal-weekly'), job('Sepal-test')
        for config in weekly, test:
            for path in [*WEEKLY, *OWN]:
                remove(config, path)
        self.assertEqual(ET.tostring(weekly, encoding='unicode'), ET.tostring(test, encoding='unicode'))


def job(name):
    return ET.parse(JOBS / name / 'config.xml').getroot()


def remove(config, path):
    element = config.find(path)
    if element is not None:
        config.find(path + '/..').remove(element)


if __name__ == '__main__':
    unittest.main()
