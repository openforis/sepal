from rx import generate

from .file import using_file


def forever():
    return generate(None, lambda _: True, lambda _: None)
