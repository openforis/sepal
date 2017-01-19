import logging
from threading import Thread

import time
from ee.batch import Task

logger = logging.getLogger(__name__)


class EarthEngineStatus(object):
    def __init__(self, task_id, listener):
        self.task_id = task_id
        self.listener = listener
        self.running = True
        self.thread = Thread(
            name='GEE_Export-' + task_id,
            target=self._poll_status)
        self.thread.start()

    def cancel(self):
        self.stop()
        task = self._task()
        if task:
            logging.debug('Cancelling Google Earth Engine export task: ' + self.task_id)
            task.cancel()

    def stop(self):
        if self.running:
            logging.debug('Stopping EarthEngineStatus')
            self.running = False

    def _poll_status(self):
        logging.debug('Starting polling status of Google Earth Engine export task: ' + self.task_id)
        try:
            while self.running:
                status = self._task_status()
                self.listener.update_status(status)
                if status['state'] != 'ACTIVE':
                    self.stop()
                    return
                time.sleep(10)
        except Exception:
            logger.exception('Export to Google Drive failed. Task id: ' + self.task_id)
            self.listener.update_status({
                'state': 'FAILED',
                'description': 'Export to Google Drive failed'})
            self.stop()

    def _task(self):
        status = Task(self.task_id).status()
        return Task(status['id'], {
            'type': status['task_type'],
            'description': status['description'],
            'state': status['state'],
        })

    def _task_status(self):
        task = Task(self.task_id).status()
        if task['state'] not in (Task.State.UNSUBMITTED, Task.State.FAILED):
            return self._to_status(task)
        else:
            logger.exception('Export to Google Drive failed. Task: ' + str(task))
            return {'state': 'FAILED',
                    'description': 'Export to Google Drive failed: ' + task['error_message']}

    def _to_status(self, task):
        state = task['state']
        if state == Task.State.FAILED:
            return {'state': 'FAILED',
                    'description': state['error_message']}
        elif state in [Task.State.CANCEL_REQUESTED, Task.State.CANCELLED]:
            return {'state': 'CANCELED',
                    'description': 'Canceled'}
        elif state == Task.State.COMPLETED:
            return {'state': 'ACTIVE',
                    'description': 'Downloading from Google Drive...',
                    'step': 'EXPORTED'}
        elif state == Task.State.READY:
            return {'state': 'ACTIVE',
                    'description': 'Export to Google Drive pending...',
                    'step': 'EXPORTING'}
        else:
            return {'state': 'ACTIVE',
                    'description': 'Exporting to Google Drive...',
                    'step': 'EXPORTING'}
