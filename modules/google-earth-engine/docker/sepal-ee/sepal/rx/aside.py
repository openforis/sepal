from typing import Callable

from rx import empty, merge
from rx.core import Observable
from rx.operators import finally_action, flat_map, take_until
from rx.subject import Subject


def aside(*sources: Observable) -> Callable[[Observable], Observable]:
    def operator(source: Observable):
        completed = Subject()

        def notifying_source():
            return source.pipe(
                finally_action(lambda: completed.on_next(True))
            )

        def aside_source(s):
            return s.pipe(
                flat_map(lambda _: empty()),
                take_until(completed),
            )

        sources_ = tuple([notifying_source()]) + tuple([aside_source(s) for s in sources])
        return merge(*sources_)

    return operator
