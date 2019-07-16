import rx
from rx import Callable, Observable, generate
from rx.operators import flat_map
from rx.subject import Subject

from .aside import aside
from .file import using_file

_dispose = Subject()


def forever():
    return generate(None, lambda _: True, lambda _: None)


def dispose():
    _dispose.on_next(True)


def throw(e):
    # noinspection PyBroadException
    try:
        raise e
    except Exception:
        return rx.throw(e)


def flat_map_of(action: Callable) -> Callable[[Observable], Observable]:
    return flat_map(lambda _: action())
