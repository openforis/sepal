import ee
import rx
from rx import defer, from_callable
from rx.core.typing import Mapper
from rx.operators import do_action, flat_map
from sepal.rx.retry import retry_with_backoff
from sepal.rx.workqueue import WorkQueue


def retry(
        credentials,
        retries: int = 0,
        description: str = None
):
    return rx.pipe(
        do_action(lambda _: ee.InitializeThread(credentials)),
        retry_with_backoff(retries=retries, description=description)
    )


def enqueue(
        credentials,
        queue: WorkQueue,
        mapper: Mapper,
        description: str = None,
        retries: int = 0
):
    def mapper_to_observable(value):
        ee.InitializeThread(credentials)
        return mapper(value)

    return rx.pipe(
        flat_map(
            lambda value: queue.enqueue(
                observable=defer(lambda _: mapper_to_observable(value)),
                group=str(credentials),
                description=description,
                retries=0
            )
        ),
        retry(credentials, retries, description)
    )


# A single group is used to execute EE operations, independent of user and credentials used.
_ee_executions = WorkQueue(
    concurrency_per_group=5,
    description='earth-engine-actions'
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
            queue=_ee_executions,
            mapper=lambda value: from_callable(lambda: mapper(value)),
            description=description,
            retries=retries
        )
    )
