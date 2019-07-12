import logging
import random
from typing import Optional

from rx import of, Observable, throw
from rx.operators import catch, concat, delay, do_action, filter, flat_map, group_by, map, merge, observe_on, share, \
    take_while, take_until
from rx.scheduler import ThreadPoolScheduler
from rx.subject import Subject
from sepal.rx.operators import on_dispose
from sepal.rx.operators import take_until_disposed
from sepal.rx.retry import retry_with_backoff


class WorkQueue(object):

    def __init__(self, concurrency_per_group, delay_seconds=0, description=None):
        self.scheduler = ThreadPoolScheduler(concurrency_per_group)
        self.request_scheduler = ThreadPoolScheduler(10)
        self._requests = Subject()
        self._output_subject = Subject()
        self._output = self._output_subject.pipe(share())
        self._description = description
        self._subscription = self._requests.pipe(
            observe_on(self.scheduler),
            group_by(lambda r: r['concurrency_group']),
            flat_map(
                lambda concurrency_group: concurrency_group.pipe(
                    map(lambda r: r['request']),
                    merge(max_concurrent=concurrency_per_group),
                    delay(delay_seconds)
                )
            ),
            take_until_disposed()
        ).subscribe(
            on_next=lambda request: self._output_subject.on_next(request),
            on_error=lambda error: logging.exception('Error in {} request stream'.format(self)),
            on_completed=lambda: self.dispose(),
            scheduler=self.scheduler
        )

    def enqueue(
            self,
            observable: Observable,
            group: str = 'default-group',
            retries: int = 0,
            description: str = None
    ):
        description = description or str(Observable)
        key = '{}({})'.format(description, random.random())

        def log_status(status):
            logging.debug(str({
                'WorkQueue': str(self),
                'group': group,
                'key': key,
                status: description
            }))

        log_status('ENQUEUED')
        error: Optional[Exception] = None

        def handle_error(e):
            log_status('FAILED')
            nonlocal error
            error = e
            return of({'key': key, 'error': e})

        def throw_if_error(r):
            if error:
                return throw(error)
            else:
                return of(r)

        request_disposed = Subject()

        def dispose_request():
            request_disposed.on_next(True)

        request = of(True).pipe(
            do_action(
                lambda _: log_status('STARTED')
            ),
            flat_map(
                lambda _: observable.pipe(
                    map(lambda value: {'key': key, 'value': value}),
                    retry_with_backoff(
                        retries=retries,
                        description='{}.enqueue(group={}, description={})'.format(self, group, description)
                    ),
                    catch(handler=lambda e, o: handle_error(e)),
                    take_until(request_disposed),
                    take_until_disposed(),
                ),
            ),
            concat(of({'key': key, 'complete': True}).pipe(
                do_action(lambda _: log_status('COMPLETED'))
            )),
        )
        result_stream = self._output.pipe(
            observe_on(self.request_scheduler),
            filter(lambda r: r['key'] == key),
            flat_map(lambda r: throw_if_error(r)),
            take_while(lambda r: not r.get('complete')),
            flat_map(lambda r: of(r.get('value'))),
            on_dispose(dispose_request)
        )
        self._requests.on_next({'request': request, 'concurrency_group': group})
        return result_stream

    def dispose(self):
        if self._subscription:
            self._subscription.dispose()

    def __str__(self):
        return 'WorkQueue({})'.format(self._description) if self._description else super().__str__()
