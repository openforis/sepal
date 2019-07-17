import ee
from ee.batch import Task
from rx import empty, of
from rx.operators import distinct_until_changed, finally_action, flat_map, take_while
from sepal.rx import throw
from sepal.task.rx.observables import progress

from .observables import execute, interval

_MONITORING_FREQUENCY = 5


def execute_task(credentials, task):
    def start():
        task.start()

    def load_status():
        return task.status()

    def extract_state(status):
        state = status['state']
        if state == 'FAILED':
            return throw(ee.EEException(status.get('error_message')))
        else:
            return of(state)

    def to_progress(state):
        if state == 'PENDING':
            return progress(
                default_message='Submitting export task to Google Earth Engine...',
                message_key='tasks.ee.export.pending'
            )
        elif state == 'READY':
            return progress(
                default_message='Waiting for Google Earth Engine to start export...',
                message_key='tasks.ee.export.ready'
            )
        elif state == 'RUNNING':
            return progress(
                default_message='Google Earth Engine is exporting image...',
                message_key='tasks.ee.export.running'
            )
        else:
            return empty()

    def monitor():
        def is_running(state):
            return state in [Task.State.UNSUBMITTED, Task.State.READY, Task.State.RUNNING]

        return interval(credentials, _MONITORING_FREQUENCY).pipe(
            flat_map(
                lambda _: execute(
                    credentials,
                    action=load_status,
                    description='monitor task ' + str(task),
                    retries=3
                )
            ),
            flat_map(extract_state),
            distinct_until_changed(),
            take_while(is_running, inclusive=True),
            flat_map(to_progress)
        )

    return execute(
        credentials,
        start,
        description='start task ' + str(task),
        retries=3
    ).pipe(
        flat_map(lambda _: monitor()),
        finally_action(lambda: task.cancel())
    )
