from typing import Callable

import rx
from rx import Observable, generate, of
from rx.operators import flat_map
from sepal.rx import operators

from .aside import aside
from .file import using_file
from .subscribe_and_wait import subscribe_and_wait


def forever():
    return generate(None, lambda _: True, lambda _: None)


def dispose():
    operators._dispose.on_next(True)


def throw(e):
    # noinspection PyBroadException
    try:
        raise e
    except Exception:
        return rx.throw(e)


def flat_map_of(action: Callable) -> Callable[[Observable], Observable]:
    return flat_map(lambda _: action())


def merge_finalize(handler: Callable[[], Observable]) -> Observable:
    return of(True).pipe(
        operators.merge_finalize(handler)
    )
