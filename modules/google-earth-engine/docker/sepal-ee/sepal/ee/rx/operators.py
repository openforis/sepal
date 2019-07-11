import ee
import rx
from rx import from_callable
from rx.core.typing import Mapper
from rx.operators import do_action, flat_map
from sepal.ee import get_credentials
from sepal.rx.retry import retry_with_backoff
from sepal.rx.workqueue import WorkQueue


def retry(
        retries: int,
        description: str
):
    credentials = get_credentials()
    return rx.pipe(
        do_action(lambda _: ee.InitializeThread(credentials)),
        retry_with_backoff(retries=retries, description=description)
    )


def enqueue(
        queue: WorkQueue,
        mapper: Mapper,
        description: str = None,
        retries: int = None
):
    credentials = get_credentials()

    def mapper_to_observable(value):
        def initializing_mapper():
            ee.InitializeThread(credentials)
            return mapper(value)

        return from_callable(initializing_mapper, _ee_executions.scheduler)

    return rx.pipe(
        flat_map(
            lambda value: queue.enqueue(
                observable=mapper_to_observable(value),
                group=str(credentials),
                description=description,
                retries=0
            )
        ),
        retry(retries, description)
    )


# A single group is used to execute EE operations, independent of user and credentials used.
_ee_executions = WorkQueue(
    concurrency_per_group=20,
    description='earth-engine-actions'
)


def execute(
        mapper: Mapper = None,
        retries: int = 3,
        description: str = None
):
    return enqueue(
        queue=_ee_executions,
        mapper=mapper,
        description=description,
        retries=retries
    )
