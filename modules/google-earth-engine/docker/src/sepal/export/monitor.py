import logging

import ee
import time
from ee.batch import Task

from ..task.task import ThreadTask

logger = logging.getLogger(__name__)


class State(object):
    PENDING = 'PENDING'
    ACTIVE = 'ACTIVE'
    COMPLETED = 'COMPLETED'
    FAILED = 'FAILED'


class MonitorEarthEngineExportTask(ThreadTask):
    def __init__(self, credentials, task_id, destination):
        super(MonitorEarthEngineExportTask, self).__init__('MonitorEarthEngineTask')
        self.credentials = credentials
        self.task_id = task_id
        self.destination = destination
        self._status = {
            'state': State.PENDING
        }

    def run(self):
        logger.info('Monitoring Earth Engine export. task_id: {0}, destination: {1}'
                    .format(self.task_id, self.destination))
        ee.InitializeThread(self.credentials)
        while self.running():
            time.sleep(10)
            status = Task(self.task_id).status()
            state = status['state']
            if state == Task.State.READY:
                self._update_state(State.PENDING)
            elif state == Task.State.RUNNING:
                self._update_state(State.ACTIVE)
            elif state == Task.State.COMPLETED:
                self._update_state(State.COMPLETED)
                self.resolve()
                return
            else:
                error_message = status['error_message'] if state == Task.State.FAILED else 'Task was canceled'
                self._status = {
                    'state': State.FAILED,
                    'message': error_message
                }
                raise Exception(
                    error_message if error_message else 'Earth Engine export failed'
                )

    def status(self):
        return self._status

    def status_message(self):
        state = self.status()['state']
        if state == State.PENDING:
            return 'Export pending...'
        if state == State.ACTIVE:
            return 'Exporting...'
        if state == State.COMPLETED:
            return 'Export complete'
        if state == State.FAILED:
            return 'Export failed: {}'.format(self.status()['message'])

    def close(self):
        try:
            ee.InitializeThread(self.credentials)
            status = Task(self.task_id).status()
            if status['state'] in (Task.State.READY, Task.State.RUNNING):
                logger.debug('Canceling Earth Engine Task {0}: {1}'.format(self, status))
                Task(status['id'], {
                    'type': status['task_type'],
                    'description': status['description'],
                    'state': status['state'],
                }).cancel()
        except ee.EEException as e:
            logger.warn('Failed to cancel task {0}: {1}'.format(self, e))

    def _update_state(self, state):
        previous_state = self._status['state']
        if previous_state != state:
            self._status['state'] = state
            logger.info('destination={0}, task_id={1}: {2} -> {3}'
                        .format(self.destination, self.task_id, previous_state, state))

    def __str__(self):
        return '{0}(destination={1}, task_id={2})'.format(type(self).__name__, self.destination, self.task_id)
