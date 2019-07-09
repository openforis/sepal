import ee
import rx
from rx import Callable, of
from rx.core.typing import RelativeTime
from rx.operators import do_action, flat_map
from rx.scheduler import TimeoutScheduler
from sepal.rx.workqueue import WorkQueue
from sepal.ee import get_credentials

from . import operators


def enqueue(
        queue: WorkQueue,
        action: Callable = None,
        description: str = None,
        retries: int = None
):
    return of(True).pipe(
        operators.enqueue(
            queue=queue,
            mapper=lambda _: action(),
            description=description,
            retries=retries
        )
    )


def execute(
        action: Callable,
        retries: int = 3,
        description: str = None
):
    return of(True).pipe(
        operators.execute(
            mapper=lambda _: action(),
            retries=retries,
            description=description
        )
    )


def interval(period: RelativeTime):
    def schedule():
        credentials = get_credentials()
        return rx.interval(period, TimeoutScheduler()).pipe(
            do_action(lambda _: ee.InitializeThread(credentials)),
        )

    return of(True).pipe(
        flat_map(lambda _: schedule())
    )

