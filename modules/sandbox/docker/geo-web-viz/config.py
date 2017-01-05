import os

import sys

working_dir = sys.argv[2]
server_port = int(sys.argv[1])
debug_mode = len(sys.argv) > 2


def to_file(path):
    # TODO: Make sure path is not outside working_dir
    # TODO: Raise proper exception if file doesn't exist
    file = working_dir + path
    if not os.path.isfile(file):
        raise Exception
    return file


def to_path(file):
    return file[(len(working_dir)):]
