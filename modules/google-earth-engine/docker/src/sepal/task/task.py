import logging
import threading
from abc import abstractmethod

from promise import Promise

from ..exception import re_raisable

try:
    import Queue as queue
except ImportError:
    import queue

logger = logging.getLogger(__name__)


class Task(object):
    UNSUBMITTED = 'UNSUBMITTED'
    SUBMITTED = 'SUBMITTED'
    RUNNING = 'RUNNING'
    RESOLVED = 'RESOLVED'
    REJECTED = 'REJECTED'
    CANCELED = 'CANCELED'

    def __init__(self):
        super(Task, self).__init__()
        self._state_lock = threading.Lock()
        self._close_lock = threading.Lock()
        self.state = Task.UNSUBMITTED
        self.event_queue = queue.Queue()
        self._resolve = None
        self._reject = None
        self._exception = None
        self._closed = False
        self._dependee = None
        self._dependents = []

    # noinspection PyUnusedLocal
    def submit(self, *args):
        if not self._set_state(Task.SUBMITTED, lambda state: state == Task.UNSUBMITTED):
            return
        self.event_queue.put({'type': Task.SUBMITTED})
        # noinspection PyTypeChecker
        return Promise(self._start)

    def resolve(self, value=None):
        if not self._set_state(Task.RESOLVED, lambda state: state in [Task.UNSUBMITTED, Task.SUBMITTED, Task.RUNNING]):
            return

        try:
            return self._resolve(value)
        finally:
            self.event_queue.put({'type': Task.RESOLVED, 'value': value})
            self._close()

    def reject(self, exception):
        if not self._set_state(Task.REJECTED, lambda state: state in [Task.UNSUBMITTED, Task.SUBMITTED, Task.RUNNING]):
            return
        self._exception = exception
        logger.exception('Rejected {0}'.format(self))
        try:
            return self._reject(exception) if self._reject else Promise.reject(exception)
        finally:
            self.event_queue.put({'type': Task.REJECTED, 'exception': exception})
            self._close()

    def cancel(self):
        if not self._set_state(Task.CANCELED, lambda state: state in [Task.UNSUBMITTED, Task.SUBMITTED, Task.RUNNING]):
            return
        try:
            raise Task.Canceled()
        except Task.Canceled as exception:
            self.reject(re_raisable())
            return self._reject(exception) if self._reject else Promise.reject(exception)
        finally:
            self.event_queue.put({'type': Task.CANCELED})
            self._close()

    def close(self):
        """Clean up any resources used by task.

        For subclasses to implement. This is automatically invoked when task is canceled or failed."""
        pass

    def status(self):
        return Task.Status(self)

    def status_message(self):
        return str(self.status())

    def active(self):
        return self.submitted() or self.running()

    def submitted(self):
        return self.state == Task.SUBMITTED

    def running(self):
        return self.state == Task.RUNNING

    def canceled(self):
        return self.state == Task.CANCELED

    def resolved(self):
        return self.state == Task.RESOLVED

    def rejected(self):
        return self.state == Task.REJECTED

    def exception(self):
        return self._exception

    @abstractmethod
    def run(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    @staticmethod
    def submit_all(tasks):
        return Promise.all([
            (task.submit() if isinstance(task, Task) else task)
            for task in tasks
        ])

    def dependent(self, task):
        self._dependents.append(task)
        task._dependee = self
        return task

    def _start(self, resolve, reject):
        raise AssertionError('Method in subclass expected to have been invoked')

    def _run_and_catch(self):
        if not self._set_state(Task.RUNNING, lambda state: state == Task.SUBMITTED):
            return
        try:
            self.run()
        except Exception:
            self.reject(re_raisable())
        finally:
            if self.state != Task.RUNNING:
                self._close()

    def _close(self):
        self._close_lock.acquire()
        try:
            if self._closed:
                return
            self._closed = True
        finally:
            self._close_lock.release()

        try:
            for dependent in self._dependents:
                dependent.cancel()
            self.close()
        except Exception as e:
            logger.exception('Error closing {0}'.format(self))

    def _set_state(self, new_state, when=lambda state: True):
        dependee = self._dependee
        dependee_lock = dependee._state_lock if self._dependee else None
        if dependee_lock:
            dependee_lock.acquire()
        self._state_lock.acquire()
        try:
            if when(self.state) and (not dependee_lock or dependee.running() or new_state == Task.CANCELED):
                logger.info('{0} -> {1}: {2}'.format(self.state, new_state, self))
                self.state = new_state
                return True
            return False
        finally:
            self._state_lock.release()
            if dependee_lock:
                dependee_lock.release()

    class Canceled(Exception):
        pass

    class Status(object):
        def __init__(self, task):
            super(Task.Status, self).__init__()
            self.current_task = task
            self.state = task.state
            self.exception = task.exception()
            if self.state in (Task.SUBMITTED, Task.RUNNING):
                for dependent in task._dependents:
                    if dependent.active():
                        self.current_task = dependent
            if self.state == Task.REJECTED:
                self.current_task = task
                for dependent in task._dependents:
                    if dependent.rejected():
                        self.current_task = dependent

        def is_current_task(self, task):
            return self.current_task == task

        def __str__(self):
            return '{0}(current_task={1}, state={2}, exception={3})' \
                .format(type(self).__name__, self.current_task, self.state, self.exception)


import multiprocessing


class ProcessTask(Task):
    def __init__(self):
        super(ProcessTask, self).__init__()
        self._process = None

    def _start(self, resolve, reject):
        self._resolve = resolve
        self._reject = reject
        process_event_queue = multiprocessing.Queue()
        self._thread = threading.Thread(target=self._handle_event, args=(process_event_queue,))
        self._thread.start()
        process = multiprocessing.Process(target=self._start_process, args=(process_event_queue,))
        process.start()
        self._process = process

    def _start_process(self, event_queue):
        self.event_queue = event_queue
        self._run_and_catch()

    def _handle_event(self, event_queue):
        while self.running() or self.state == Task.SUBMITTED:
            try:
                event = event_queue.get(timeout=1)
                event_type = event.get('type', None)
                if event_type == Task.RESOLVED:
                    self.resolve(event.get('value', None))
                if event_type == Task.CANCELED:
                    self.cancel()
                if event_type == Task.REJECTED:
                    self.reject(event.get('exception', None))
            except queue.Empty:
                pass

    def _close(self):
        self._close_lock.acquire()
        try:
            if self._closed:
                return
            self._closed = True
        finally:
            self._close_lock.release()

        try:
            if self._process and self._process.is_alive():
                self._process.terminate()
            self.close()
        except Exception:
            logger.exception('Error closing {0}'.format(self))


class ThreadTask(Task):
    def __init__(self, name=None):
        super(ThreadTask, self).__init__()
        self._thread = threading.Thread(
            name=name,
            target=self._run_and_catch)

    def _start(self, resolve, reject):
        self._resolve = resolve
        self._reject = reject
        self._thread.start()
