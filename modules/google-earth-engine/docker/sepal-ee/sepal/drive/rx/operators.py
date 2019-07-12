import rx
from rx import defer, of
from rx.core.typing import Mapper
from rx.operators import flat_map
from sepal.rx.workqueue import WorkQueue


def enqueue(
        credentials,
        queue: WorkQueue,
        mapper: Mapper,
        description: str = None,
        retries: int = 0
):
    return rx.pipe(
        flat_map(
            lambda value: queue.enqueue(
                observable=mapper(value),
                group=str(credentials),
                description=description,
                retries=retries
            )
        )
    )


_drive_executions = WorkQueue(
    concurrency_per_group=2,
    delay_seconds=.1,
    description='earth-engine-exports'
)


def execute(
        credentials,
        mapper: Mapper = None,
        retries: int = 3,
        description: str = None
):
    return rx.pipe(
        enqueue(
            credentials,
            queue=_drive_executions,
            mapper=lambda value: defer(lambda _: of(mapper(value))),
            description=description,
            retries=retries
        )
    )
