import os
from base64 import b64encode

import sys

print('before: ' + str(sys.argv))
sys.argv = sys.argv[(len(sys.argv) - 3):]  # Hack to run with gunicorn
print('after: ' + str(sys.argv))
working_dir = sys.argv[2]
server_port = int(sys.argv[1])
debug_mode = len(sys.argv) > 2
session_key = b64encode(os.urandom(24)).decode('utf-8')


def to_file(path):
    file = working_dir + path
    if not os.path.isfile(file):
        raise Exception
    return file


def to_path(file):
    return file[(len(working_dir)):]
