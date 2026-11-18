"""Formats the results of an Ansible dnf task as a table of package changes, one package per line."""
import re

# name-[epoch:]version-release.arch
NEVRA = re.compile(r'^(?P<name>.+)-(?P<version>[^-]+-[^-]+)\.(?P<arch>[^.]+)$')


def package_changes(results):
    installed = versions(results, 'Installed: ')
    removed = versions(results, 'Removed: ')
    rows = [(name, removed.get(name, '(new)'), installed.get(name, '(removed)'))
            for name in sorted(installed.keys() | removed.keys())]
    widths = [max(len(row[column]) for row in rows) for column in (0, 1)] if rows else [0, 0]
    return '\n'.join(f'{name:<{widths[0]}}  {old:<{widths[1]}}  ->  {new}' for name, old, new in rows)


def versions(results, prefix):
    packages = {}
    for result in results:
        if result.startswith(prefix):
            match = NEVRA.match(result[len(prefix):])
            if match:
                packages[match['name']] = match['version']
    return packages


class FilterModule:
    def filters(self):
        return {'package_changes': package_changes}
