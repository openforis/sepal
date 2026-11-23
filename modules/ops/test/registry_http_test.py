import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import sys
from threading import Thread
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'script'))
from registry_cleanup import CleanupError, Registry


class RegistryHttpTest(unittest.TestCase):
    def setUp(self):
        self.responses = {}
        responses = self.responses

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                status, headers, body = responses[self.path]
                self.send_response(status)
                for name, value in headers.items():
                    self.send_header(name, value)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.thread = Thread(target=server.serve_forever, daemon=True)
        self.thread.start()
        self.addCleanup(self.thread.join)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        self.registry = Registry(f'http://127.0.0.1:{server.server_port}')

    def test_follows_every_catalog_page_including_relative_query_links(self):
        self.responses.update({
            '/v2/_catalog?n=1000': (200, {'Link': '</v2/_catalog?n=1000&last=a>; rel="next"'}, b'{"repositories":["openforis/a"]}'),
            '/v2/_catalog?n=1000&last=a': (200, {'Link': '<?n=1000&last=b>; rel="next"'}, b'{"repositories":["openforis/b"]}'),
            '/v2/_catalog?n=1000&last=b': (200, {}, b'{"repositories":["openforis/c"]}'),
        })
        self.assertEqual(self.registry.repositories(), ['openforis/a', 'openforis/b', 'openforis/c'])

    def test_repeating_pages_fail_instead_of_looping(self):
        self.responses['/v2/_catalog?n=1000'] = (200, {'Link': '<?n=1000>; rel="next"'}, b'{"repositories":[]}')
        with self.assertRaises(CleanupError):
            self.registry.repositories()

    def test_only_registry_not_found_errors_mean_an_absent_image(self):
        path = '/v2/openforis/a/manifests/1'
        self.responses[path] = (404, {}, b'{"errors":[{"code":"MANIFEST_UNKNOWN"}]}')
        self.assertIsNone(self.registry.manifest('openforis/a', '1'))
        for code, body in ((404, b'proxy not found'), (403, b'forbidden'), (500, b'unavailable')):
            with self.subTest(code=code):
                self.responses[path] = (code, {}, body)
                with self.assertRaises(CleanupError):
                    self.registry.manifest('openforis/a', '1')

    def test_checks_manifest_body_against_the_registrys_digest(self):
        body = json.dumps({'schemaVersion': 2}).encode()
        digest = 'sha256:' + hashlib.sha256(body).hexdigest()
        path = '/v2/openforis/a/manifests/1'
        self.responses[path] = (200, {'Docker-Content-Digest': digest}, body)
        self.assertEqual(self.registry.manifest('openforis/a', '1'), (digest, {'schemaVersion': 2}))
        self.responses[path] = (200, {'Docker-Content-Digest': digest}, body + b' ')
        with self.assertRaises(CleanupError):
            self.registry.manifest('openforis/a', '1')
