import logging
import random
import threading
import time
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

    def __init__(self, retries=0):
        super(Task, self).__init__()
        self.state = Task.UNSUBMITTED
        self._state_lock = threading.Lock()
        self._close_lock = threading.Lock()
        self._retries = retries
        self._resolve = None
        self._reject = None
        self._exception = None
        self._closed = False
        self._dependee = None
        self._dependents = []
        self._event_queue = queue.Queue()
        self._current_try = 1
        self._delay = 0

    # noinspection PyUnusedLocal
    def submit(self, *args):
        if not self._set_state(Task.SUBMITTED, lambda state: state == Task.UNSUBMITTED):
            return
        self._enqueue({'type': Task.SUBMITTED})
        return Promise(self._start)

    def submit_with_delay(self, delay=0):
        self._delay = delay
        return self.submit()

    def resolve(self, value=None):
        if not self._set_state(Task.RESOLVED, lambda state: state in [Task.UNSUBMITTED, Task.SUBMITTED, Task.RUNNING]):
            return

        try:
            return self._resolve(value)
        finally:
            self._enqueue({'type': Task.RESOLVED, 'value': value})
            self._close()

    def reject(self, exception):
        if not self._set_state(Task.REJECTED, lambda state: state in [Task.UNSUBMITTED, Task.SUBMITTED, Task.RUNNING]):
            return
        if self._current_try <= self._retries:
            self._set_state(Task.SUBMITTED)
            delay_seconds = (2 ** self._current_try) + (random.randint(0, 1000) / 1000)
            logger.error(
                'Retrying {0} in {1} seconds. exception: {2}, try: {3} of {4}'
                    .format(self, delay_seconds, exception, self._current_try, self._retries + 1)
            )
            time.sleep(delay_seconds)
            self._current_try = self._current_try + 1
            self._start(self._resolve, self._reject)
            return
        logger.error('Rejected {0} after {1} tries. exception: {2}'.format(self, self._current_try, exception))
        self._exception = exception
        try:
            return self._reject(exception) if self._reject else Promise.reject(exception)
        finally:
            self._enqueue({'type': Task.REJECTED, 'exception': str(exception)})
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
            self._enqueue({'type': Task.CANCELED})
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

    def _enqueue(self, item):
        self._event_queue.put(item)

    def dequeue(self, timeout=None):
        return self._event_queue.get(timeout=timeout)

    @abstractmethod
    def run(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    @staticmethod
    def submit_all(tasks, delay=0):
        return Promise.all([
            (task.submit_with_delay(i * delay * random.random()) if isinstance(task, Task) else task)
            for i, task in enumerate(tasks)
        ])

    def dependent(self, task):
        self._dependents.append(task)
        task._dependee = self
        return task

    def pipe(self, *callbacks):
        callbacks = list(callbacks)
        callbacks.append(self.resolve)
        if self.state == Task.UNSUBMITTED:
            next_promise = self.submit()
        else:
            next_promise = callbacks[0] if isinstance(callbacks[0], Promise) else callbacks[0]()
            callbacks = callbacks[1:]

        def create_callbacks(callback):
            def did_fulfill(value):
                if self.state == Task.REJECTED:
                    return
                try:
                    # return callback(value) if pass_value else callback()
                    return callback()
                except:
                    logger.exception('Failed to execute success callback for task {0}'.format(0))

            return did_fulfill, self.reject

        for callback in callbacks:
            did_fulfill, did_reject = create_callbacks(callback)
            next_promise = next_promise.then(did_fulfill, did_reject)

        return next_promise

    def _start(self, resolve, reject):
        raise AssertionError('Method in subclass expected to have been invoked')

    def _run_and_catch(self):
        if not self._set_state(Task.RUNNING, lambda state: state == Task.SUBMITTED):
            return
        if self._delay:
            logger.info('Delaying running the task for {0} seconds: {1}'.format(self._delay, self))
            time.sleep(float(self._delay))
        try:
            self.run()
        except:
            logger.exception('Failed to execute task {0}'.format(self))
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
        super(ProcessTask, self).__init__(retries=0)
        self._process = None

    def _start(self, resolve, reject):
        self._resolve = resolve
        self._reject = reject
        _event_queue = multiprocessing.Queue()
        self._thread = threading.Thread(target=self._handle_event, args=(_event_queue,))
        self._thread.start()
        process = multiprocessing.Process(target=self._start_process, args=(_event_queue,))
        process.start()
        self._process = process

    def _start_process(self, event_queue):
        self._event_queue = event_queue
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

    def _close(self, retry=0):
        if retry < 5:
            self._close_lock.acquire()
            try:
                if self._closed:
                    return
                if self._is_process_closed():
                    self._closed = True
                    self.close()
                    return
            finally:
                self._close_lock.release()

            time.sleep(1)
            self._close(retry + 1)  # Check if process completed after a second
        else:  # Last retry
            self._close_lock.acquire()
            try:
                if self._closed:
                    return
                if self._is_process_closed():
                    self._closed = True
                    self.close()
                    return
                else:  # Just terminate the process - it's not done after waiting
                    try:
                        self._process.terminate()
                        self.close()
                    except Exception:
                        logger.exception('Error closing {0}'.format(self))
                        return
            finally:
                self._close_lock.release()

    def _is_process_closed(self):
        return not self._process or not self._process.is_alive()

    def _enqueue(self, item):
        self._event_queue.put(item)

    def dequeue(self, timeout=None):
        return self._event_queue.get(timeout=timeout)


class ThreadTask(Task):
    def __init__(self, name=None, retries=0):
        super(ThreadTask, self).__init__(retries)
        self.name = name

    def _start(self, resolve, reject):
        self._thread = threading.Thread(
            name=self.name,
            target=self._run_and_catch)
        self._resolve = resolve
        self._reject = reject
        self._thread.start()
