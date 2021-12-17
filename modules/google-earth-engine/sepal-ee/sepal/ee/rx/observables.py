import ee
import rx
from rx import Callable, of
from rx.core.typing import RelativeTime
from rx.operators import do_action, flat_map
from rx.scheduler import TimeoutScheduler
from sepal.rx.workqueue import WorkQueue

from . import operators


def enqueue(
        credentials,
        queue: WorkQueue,
        action: Callable = None,
        description: str = None,
        retries: int = 0
):
    return of(True).pipe(
        operators.enqueue(
            credentials,
            queue=queue,
            mapper=lambda _: action(),
            description=description,
            retries=retries
        )
    )


def execute(
        credentials,
        action: Callable,
        retries: int = 3,
        description: str = None
):
    return of(True).pipe(
        operators.execute(
            credentials,
            mapper=lambda _: action(),
            retries=retries,
            description=description
        )
    )


def interval(credentials, period: RelativeTime):
    def schedule():
        return rx.interval(period, TimeoutScheduler.singleton()).pipe(
            do_action(lambda _: ee.InitializeThread(credentials)),
        )

    return of(True).pipe(
        flat_map(lambda _: schedule())
    )
