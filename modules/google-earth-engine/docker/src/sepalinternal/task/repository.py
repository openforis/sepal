import importlib
import logging

from rx import Observable
from sepal.rx import dispose
from sepal.task.progress import Progress
import ee
_task_by_id = {}


def submit(task_id, module, spec, context):
    logging.info('submit(task_id={}, module={}, spec={}, context={})'.format(task_id, module, spec, context))
    task_status = {
        'state': 'ACTIVE',
        'progress': Progress(
            default_message='Initializing...',
            message_key='tasks.status.initializing'
        ).to_json()
    }

    def on_next(p):
        logging.info('on_next(p={}, task_id={})'.format(p, task_id))
        task_status['progress'] = p.to_json()

    def on_error(e):
        logging.exception('Failed to execute task {}: {}'.format(spec['title'], e))
        task_status['state'] = 'FAILED'
        if type(e) == ee.EEException:
            task_status['progress'] = Progress(
                default_message='Earth Engine: {}'.format(e),
                message_key='tasks.status.EEException',
                error=str(e)
            ).to_json()
        else:
            task_status['progress'] = Progress(
                default_message='Failed: {}'.format(e),
                message_key='tasks.status.failed',
                error=str(e)
            ).to_json()


    def on_completed():
        logging.info('completed(task_id={})'.format(task_id))
        task_status['state'] = 'COMPLETED'
        task_status['progress'] = Progress(
            default_message='Completed',
            message_key='tasks.status.completed'
        ).to_json()

    factory = importlib.import_module(name='sepalinternal.' + module)
    observable: Observable = factory.create(spec, context)
    subscription = observable.subscribe(
        on_next=on_next,
        on_error=on_error,
        on_completed=on_completed
    )
    task = {'subscription': subscription, 'status': task_status}
    _task_by_id[task_id] = task


def status(task_id):
    task = _get_task(task_id)
    return task['status']


def cancel(task_id):
    logging.info('cancel(task_id={})'.format(task_id))
    task = _get_task(task_id)
    task['subscription'].dispose()
    task['status'] = {
        'state': 'CANCELED',
        'progress': Progress(
            default_message='Canceled',
            message_key='tasks.status.canceled'
        ).to_json()  # TODO: Create progress
    }


def close():
    for task_id in _task_by_id:
        task = _task_by_id.get(task_id)
        if task:
            task['subscription'].dispose()
    dispose()


def _get_task(task_id):
    return _task_by_id[task_id]
