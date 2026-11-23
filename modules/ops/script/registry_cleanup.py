"""Registry protocol and retention rules; no Docker or Git mutations here."""
import hashlib
import json
import re
from dataclasses import dataclass
from datetime import datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urljoin, urlsplit
from urllib.request import Request, urlopen


class CleanupError(Exception):
    pass


BUILD = re.compile(r'^(\d+)(-test|-hotfix|-weekly)?$')
ACCEPT = ', '.join((
    'application/vnd.docker.distribution.manifest.v2+json',
    'application/vnd.docker.distribution.manifest.list.v2+json',
    'application/vnd.oci.image.manifest.v1+json',
    'application/vnd.oci.image.index.v1+json',
))


@dataclass
class CleanupPlan:
    protected: set
    delete: tuple
    untag: tuple
    reasons: list

    @property
    def enabled(self):
        return not self.reasons


def plan_cleanup(registry, refs, repositories_for_commit):
    protected, deployments = protected_builds(refs)
    cache, graph, postorder, tags = {}, {}, [], {}

    def get(repo, reference):
        key = repo, reference
        if key not in cache:
            cache[key] = registry.manifest(*key)
        return cache[key]

    def visit(repo, digest):
        key = repo, digest
        if key in graph:
            return
        found = get(repo, digest)
        graph[key] = found[1] if found else None
        if found:
            for child in children(found[1]):
                visit(repo, child)
            postorder.append(key)

    for repo in registry.repositories():
        if not repo.startswith('openforis/'):
            continue
        for tag in registry.tag_names(repo):
            found = get(repo, tag)
            if not found:
                raise CleanupError(f'Listed tag disappeared: {repo}:{tag}')
            tags[repo, tag] = found[0]
            visit(repo, found[0])

    reasons, complete = [], set()
    for build, commit in protected.items():
        expected = repositories_for_commit(commit)
        if not expected:
            raise CleanupError(f'No pushed repositories found for build {build}')
        found = [get(repo, build) for repo in expected]
        if any(found):
            if not all(found):
                reasons.append(f'Protected build {build} is only partly present')
            else:
                complete.add(build)
        # Wholly absent builds were removed by the one-time reset; they protect nothing.

    keep = set()

    def protect(repo, digest):
        key = repo, digest
        if key in keep:
            return
        keep.add(key)
        if graph.get(key) is None:
            reasons.append(f'Protected manifest is missing: {repo}@{digest}')
            return
        for child in children(graph[key]):
            protect(repo, child)

    for (repo, tag), digest in tags.items():
        if tag in protected:
            protect(repo, digest)
    for env, builds in deployments.items():
        if len(builds) < 2 or not builds.issubset(complete):
            reasons.append(f'{env} needs two distinct, complete deployed builds')
    return CleanupPlan(set(protected), tuple(k for k in postorder if k not in keep),
        tuple(sorted((repo, tag) for (repo, tag), digest in tags.items()
            if (repo, digest) in keep and BUILD.fullmatch(tag) and tag not in protected)), reasons)


def protected_builds(refs):
    selected, deployed, jobs = {}, {'prod': [], 'test': []}, {}
    for name, commit in refs.items():
        if name.startswith('build-') and (match := BUILD.fullmatch(name[6:])):
            jobs.setdefault(match[2] or '', []).append((int(match[1]), name[6:], commit))
        elif name.startswith(('deployed/prod/', 'deployed/test/')):
            parts = name.split('/')
            try:
                if len(parts) != 4 or not BUILD.fullmatch(parts[3]):
                    raise ValueError()
                timestamp = datetime.strptime(parts[2], '%Y%m%dT%H%M%SZ')
            except ValueError:
                raise CleanupError(f'Malformed deployment record: {name}') from None
            deployed[parts[1]].append((timestamp, parts[3], commit))

    def add(build, commit):
        if build in selected and selected[build] != commit:
            raise CleanupError(f'Conflicting commits for build {build}')
        selected[build] = commit

    for builds in jobs.values():
        for _, build, commit in sorted(builds, reverse=True)[:3]:
            add(build, commit)
    deployments = {}
    for env, records in deployed.items():
        builds = set()
        for _, build, commit in sorted(records, reverse=True):
            if build not in builds:
                add(build, commit)
                builds.add(build)
            if len(builds) == 2:
                break
        deployments[env] = builds
    return selected, deployments


def children(manifest):
    try:
        return [child['digest'] for child in manifest.get('manifests', [])]
    except (TypeError, KeyError):
        raise CleanupError('Invalid image index') from None


class Registry:
    def __init__(self, url):
        self.url = url.rstrip('/') + '/'

    def repositories(self):
        return self.pages('v2/_catalog?n=1000', 'repositories')

    def tag_names(self, repo):
        return self.pages(f'v2/{repo}/tags/list?n=1000', 'tags')

    def pages(self, path, key):
        result, seen = [], set()
        while path:
            current = urljoin(self.url, path)
            if current in seen:
                raise CleanupError('Registry pagination repeated a page')
            seen.add(current)
            body, headers = self.request(path)
            try:
                values = json.loads(body)[key] or []
                if not isinstance(values, list) or not all(isinstance(v, str) for v in values):
                    raise ValueError()
                result.extend(values)
            except (ValueError, KeyError, TypeError):
                raise CleanupError('Invalid registry listing') from None
            link = headers.get('Link')
            if link:
                match = re.fullmatch(r'<([^>]+)>;\s*rel="next"', link)
                if not match:
                    raise CleanupError('Invalid registry pagination')
                path = urljoin(current, match[1])
            else:
                path = None
        return result

    def manifest(self, repo, reference):
        found = self.request(f'v2/{repo}/manifests/{quote(reference, safe=":")}', missing=True)
        if found is None:
            return None
        body, headers = found
        digest = 'sha256:' + hashlib.sha256(body).hexdigest()
        if headers.get('Docker-Content-Digest') != digest or (reference.startswith('sha256:') and reference != digest):
            raise CleanupError(f'Manifest digest mismatch: {repo}:{reference}')
        try:
            return digest, json.loads(body)
        except ValueError:
            raise CleanupError(f'Invalid manifest: {repo}:{reference}') from None

    def delete(self, repo, reference):
        self.request(f'v2/{repo}/manifests/{quote(reference, safe=":")}', method='DELETE')

    def ready(self):
        self.request('v2/')

    def request(self, path, method='GET', missing=False):
        url = urljoin(self.url, path)
        if (urlsplit(url).scheme, urlsplit(url).netloc) != (urlsplit(self.url).scheme, urlsplit(self.url).netloc):
            raise CleanupError('Registry pagination changed server')
        try:
            with urlopen(Request(url, method=method, headers={'Accept': ACCEPT}), timeout=30) as response:
                if response.status != (202 if method == 'DELETE' else 200):
                    raise CleanupError(f'Registry returned {response.status} for {method} {path}')
                return response.read(), response.headers
        except HTTPError as error:
            with error:
                if missing and error.code == 404:
                    try:
                        errors = json.loads(error.read())['errors']
                        if errors and all(e['code'] in ('NAME_UNKNOWN', 'MANIFEST_UNKNOWN') for e in errors):
                            return None
                    except (ValueError, KeyError, TypeError):
                        pass
                raise CleanupError(f'Registry returned {error.code} for {method} {path}') from None
        except (URLError, OSError) as error:
            raise CleanupError(f'Registry request failed: {error}') from None
