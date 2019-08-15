import logging
from typing import Callable

import rx
from rx import empty, throw
from rx.core import Observable
from rx.operators import finally_action, flat_map, merge, take_until
from rx.subject import Subject
from sepal.rx.subscribe_and_wait import subscribe_and_wait

_dispose = Subject()


def take_until_disposed() -> Callable[[Observable], Observable]:
    return rx.pipe(
        take_until(_dispose)
    )


def merge_finalize(handler: Callable[[], Observable]) -> Callable[[Observable], Observable]:
    def invoke_handler():
        try:
            return handler().pipe(
                flat_map(lambda _: empty())
            )
        except:
            logging.exception('Error while finalizing')
            return empty()

    return rx.pipe(
        finally_action(
            lambda: subscribe_and_wait(invoke_handler())
        )
    )


def throw_when(errors: Observable) -> Callable[[Observable], Observable]:
    return rx.pipe(
        merge(
            errors.pipe(
                flat_map(lambda e: throw(e))
            )
        )
    )
