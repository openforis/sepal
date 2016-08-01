import json
import socket

import sys

streams = {0: 'stdin', 1: 'stdout', 2: 'stderr'}


def read(container_id, container_name, socket_path):
    docker = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    docker.connect(socket_path)
    docker.sendall('GET /containers/' + container_id + '/logs?stderr=1&stdout=1&tail=1&follow=1 HTTP/1.1\r\n\r\n')
    _header(docker)
    for entry in _entries(container_name, docker):
        sys.stdout.write(json.dumps(entry) + '\n')
        sys.stdout.flush()


def _header(docker):
    for line in _lines(docker):
        if not line:
            break


def _entries(container_name, docker):
    content_line = False  # Every second non-empty line contains the content
    for line in _lines(docker):
        if len(line) == 0:
            continue
        if content_line:
            stream = line[0]  # first byte is the stream type
            if stream in [0, 1, 2]:
                line = line[8:]
            else:
                stream = 2
            message = line.decode('utf-8').strip()  # everything after the first 8 bytes is the message
            if message:
                yield {'container': container_name, 'stream': streams[stream], 'message': message}

        content_line = not content_line


def _lines(docker):
    buffer = bytearray(4096)
    line = b''
    while 1:
        read_byte_count = docker.recv_into(buffer)
        lines = buffer[:read_byte_count].split('\r\n')
        while lines:
            head, lines = lines[0], lines[1:]
            line += head
            if lines:
                yield line
                line = b''


read(
    container_id=sys.argv[1],
    container_name=sys.argv[2],
    socket_path='/tmp/docker.sock')
