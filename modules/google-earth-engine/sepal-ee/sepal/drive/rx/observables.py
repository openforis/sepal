import sepal
import rx
from rx import Callable, Observable, of
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
        retries: int = None
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
        retries: int = 5,
        description: str = None
) -> Observable:
    return of(True).pipe(
        operators.execute(
            credentials,
            mapper=lambda _: action(),
            retries=retries,
            description=description
        )
    )
