from rx import generate
from rx.subject import Subject

from .file import using_file
from .aside import aside

_dispose = Subject()


def forever():
    return generate(None, lambda _: True, lambda _: None)


def dispose():
    _dispose.on_next(True)
