import threading
from typing import Optional

from rx import Observable, typing


def subscribe_and_wait(
        observable: Observable,
        on_error: Optional[typing.OnError] = None,
        on_completed: Optional[typing.OnCompleted] = None,
        on_next: Optional[typing.OnNext] = None,
        scheduler: Optional[typing.Scheduler] = None
):
    disposed = threading.Event()

    def _on_next(value):
        if on_next:
            on_next(value)

    def _on_error(error):
        if on_error:
            on_error(error)
        disposed.set()

    def _on_completed():
        if on_completed:
            on_completed()
        disposed.set()

    observable.subscribe(
        on_next=_on_next,
        on_error=_on_error,
        on_completed=_on_completed,
        scheduler=scheduler
    )
    disposed.wait()
