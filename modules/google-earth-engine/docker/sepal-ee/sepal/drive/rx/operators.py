import rx
import sepal
from rx import Callable, from_callable, of, Observable
from rx.core.typing import Mapper
from rx.operators import delay, do_action, flat_map
from rx.scheduler import TimeoutScheduler
from sepal.drive import get_credentials
from sepal.rx.retry import retry_with_backoff
from sepal.rx.workqueue import WorkQueue

_drive_executions = WorkQueue(
    concurrency_per_group=2,
    description='earth-engine-exports'
)


def retry(
        retries: int,
        description: str
) -> Callable[[Observable], Observable]:
    credentials = get_credentials()
    return rx.pipe(
        do_action(lambda _: sepal.drive.InitializeThread(credentials)),
        retry_with_backoff(retries=retries, description=description)
    )


def execute(
        mapper: Mapper = None,
        retries: int = 3,
        description: str = None
) -> Callable[[Observable], Observable]:
    credentials = get_credentials()

    def mapper_to_observable(value):
        def initializing_mapper():
            sepal.drive.InitializeThread(credentials)
            return mapper(value)

        return of(True).pipe(
            delay(0.1, TimeoutScheduler()),
            flat_map(lambda _: from_callable(initializing_mapper, _drive_executions.scheduler))
        )

    return rx.pipe(
        flat_map(
            lambda value: _drive_executions.enqueue(
                observable=mapper_to_observable(value),
                retries=retries,
                description=description
            )
        )
    )
