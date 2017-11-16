import logging

import ee
import time
from ee.batch import Task

from ..task import Task as SepalTask

logger = logging.getLogger(__name__)


class State(object):
    PENDING = 'PENDING'
    ACTIVE = 'ACTIVE'
    COMPLETED = 'COMPLETED'
    FAILED = 'FAILED'


class MonitorEarthEngineExportTask(SepalTask):
    def __init__(self, credentials, task_id, destination):
        super(MonitorEarthEngineExportTask, self).__init__('MonitorEarthEngineTask')
        self.credentials = credentials
        self.task_id = task_id
        self.destination = destination
        self.status = {
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
                error_message = status['error_message']
                self.status = {
                    'state': State.FAILED,
                    'message': error_message
                }
                raise Exception(
                    'Earth Engine drive export to {0} failed: {1}'.format(self.destination, error_message)
                    if error_message
                    else 'Earth Engine drive export to {0} failed'.format(self.destination)
                )
        status = Task(self.task_id).status()
        if status in (Task.State.READY, Task.State.RUNNING):
            Task(status['id'], {
                'type': status['task_type'],
                'description': status['description'],
                'state': status['state'],
            }).cancel()

    def _update_state(self, state):
        if self.status['state'] != state:
            self.status['state'] = state
            logger.info('Updated state of Earth Engine export. task_id: {0}, destination: {1}, state: {2}'
                        .format(self.task_id, self.destination, state))

    def __str__(self):
        return '{0}(destination={1}, task_id={2})'.format(type(self).__name__, self.destination, self.task_id)
