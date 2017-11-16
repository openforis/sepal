import logging
from abc import abstractmethod
from threading import Thread, Lock

from promise import Promise

from exception import re_raisable

logger = logging.getLogger(__name__)

UNSUBMITTED = 'UNSUBMITTED'
SUBMITTED = 'SUBMITTED'
RUNNING = 'RUNNING'
RESOLVED = 'RESOLVED'
REJECTED = 'REJECTED'
CANCELED = 'CANCELED'


class Task(object):
    def __init__(self, name=None):
        super(Task, self).__init__()
        self.lock = Lock()
        self.state = UNSUBMITTED
        self._resolve = None
        self._reject = None
        self._thread = Thread(
            name=name,
            target=self._run_and_catch)

    def submit(self, *args):
        if not self._set_state(SUBMITTED, lambda state: state == UNSUBMITTED):
            logger.warn('Not UNSUBMITTED {0}: {1}'.format(self, self.state))
            return
        logger.debug('Submitting {0}.'.format(self))
        return Promise(self._start_thread)

    def resolve(self, value=None):
        if not self._set_state(RESOLVED, lambda state: state in [UNSUBMITTED, SUBMITTED, RUNNING]):
            logger.debug('Will not resolve: Is {0}, not UNSUBMITTED, SUBMITTED, RUNNING. {1}'.format(self.state, self))
            return
        logger.debug('Resolving {0}. value: {1}'.format(self, value))

        try:
            return self._resolve(value)
        finally:
            self._close()

    def reject(self, exception):
        if not self._set_state(REJECTED, lambda state: state in [UNSUBMITTED, SUBMITTED, RUNNING]):
            logger.debug('Will not reject: Is {0}, not UNSUBMITTED, SUBMITTED, RUNNING. {1}'.format(self.state, self))
            return
        logger.debug('Rejecting {0}. exception: {1}({2})'.format(self, type(exception).__name__, exception))

        try:
            return self._reject(exception) if self._reject else Promise.reject(exception)
        finally:
            self._close()

    def cancel(self):
        if not self._set_state(CANCELED, lambda state: state in [UNSUBMITTED, SUBMITTED, RUNNING]):
            logger.debug('Will not cancel: Is {0}, not UNSUBMITTED, SUBMITTED, RUNNING. {1}'.format(self.state, self))
            return
        logger.debug('Canceling {0}.'.format(self))
        try:
            raise self.Canceled()
        except self.Canceled:
            self.reject(re_raisable())
        finally:
            self._close()

    def close(self):
        """Clean up any resources used by task.

        For subclasses to implement. This is automatically invoked when task is canceled or failed."""
        pass

    def running(self):
        return self.state == RUNNING

    def resolved(self):
        return self.state == RESOLVED

    @abstractmethod
    def run(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    @staticmethod
    def cancel_all(tasks):
        for task in tasks:
            if task and not isinstance(task, Task):
                raise TypeError('Not a Task: {0}'.format(task))
            if task:
                task.cancel()

    @staticmethod
    def submit_all(tasks):
        return Promise.all([
            (task.submit() if isinstance(task, Task) else task)
            for task in tasks
        ])

    # noinspection PyTypeChecker
    def _start_thread(self, resolve, reject):
        self._resolve = resolve
        self._reject = reject
        self._thread.start()

    def _run_and_catch(self):
        if not self._set_state(RUNNING, lambda state: state == SUBMITTED):
            return
        try:
            self.run()
        except Exception:
            self.reject(re_raisable())
        finally:
            if self.state != RUNNING:
                self._close()

    def _close(self):
        logger.debug('Closing {0}'.format(self))
        try:
            self.close()
        except Exception:
            logger.error('Error closing {0}'.format(self))

    def _set_state(self, new_state, when=lambda state: True):
        self.lock.acquire()
        try:
            if when(self.state):
                logger.debug('_set_state {0} -> {1}: {2}'.format(self.state, new_state, self))
                self.state = new_state
                return True
            return False
        finally:
            self.lock.release()
