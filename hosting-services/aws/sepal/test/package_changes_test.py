import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'filter_plugins'))

from package_changes import package_changes  # noqa: E402


class PackageChangesTest(unittest.TestCase):

    def test_pairs_each_upgraded_package_with_its_old_version(self):
        results = [
            'Installed: openssl-libs-1:3.5.8-1.amzn2023.0.4.x86_64',
            'Installed: tzdata-2026f-1.amzn2023.0.1.noarch',
            'Removed: tzdata-2026e-1.amzn2023.0.1.noarch',
            'Removed: openssl-libs-1:3.5.8-1.amzn2023.0.3.x86_64',
        ]

        self.assertEqual(package_changes(results), '\n'.join([
            'openssl-libs  1:3.5.8-1.amzn2023.0.3  ->  1:3.5.8-1.amzn2023.0.4',
            'tzdata        2026e-1.amzn2023.0.1    ->  2026f-1.amzn2023.0.1',
        ]))

    def test_marks_packages_only_installed_or_only_removed(self):
        results = [
            'Installed: kernel6.18-6.18.4-1.amzn2023.x86_64',
            'Removed: obsolete-tool-1.0-1.amzn2023.noarch',
        ]

        self.assertEqual(package_changes(results), '\n'.join([
            'kernel6.18     (new)           ->  6.18.4-1.amzn2023',
            'obsolete-tool  1.0-1.amzn2023  ->  (removed)',
        ]))

    def test_ignores_other_results(self):
        self.assertEqual(package_changes(['Nothing to do']), '')


if __name__ == '__main__':
    unittest.main()
