import logging
import random

from rx import from_callable, of, throw
from rx.operators import catch, concat, filter, flat_map, group_by, map, merge, subscribe_on, take_while, do_action
from rx.scheduler import ThreadPoolScheduler
from rx.subject import ReplaySubject, Subject

from sepal.rx.retry import retry_with_backoff


class WorkQueue(object):
    def __init__(self, concurrency_per_group, description=None):
        self._requests = Subject()
        self._output = ReplaySubject()
        self._description = description
        self._scheduler = ThreadPoolScheduler(concurrency_per_group)
        self._subscription = self._requests.pipe(
            group_by(lambda r: r['concurrency_group']),
            flat_map(
                lambda concurrency_group: concurrency_group.pipe(
                    map(lambda r: r['request']),
                    merge(max_concurrent=concurrency_per_group)
                )
            )
        ).subscribe(
            on_next=lambda request: self._output.on_next(request),
            on_error=lambda error: logging.exception('Error in {} request stream'.format(self)),
            on_completed=lambda: logging.error('{} request stream unexpectedly completed'.format(self)),
            scheduler=self._scheduler
        )

    def enqueue(self, observable=None, callable=None, group=None, retries=0, description=None):
        if callable:
            observable = from_callable(callable, self._scheduler)
            description = description or str(callable)
        else:
            observable = observable.pipe(
                subscribe_on(self._scheduler)
            )
            description = description or str(observable)
        description = description or str(observable)
        key = '{}({})'.format(description, random.random())

        def log_status(status):
            logging.debug(str({
                'WorkQueue': str(self),
                'group': str(group),
                'key': key,
                status: str(description)
            }))

        log_status('ENQUEUED')
        error = None

        def handle_error(e):
            log_status('FAILED')
            nonlocal error
            error = e
            return of({'key': key, 'error': e})

        def throw_if_error(request):
            if error:
                return throw(error)
            else:
                return of(request)

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
                )
            ),
            concat(of({'key': key, 'complete': True}).pipe(
                do_action(lambda _: log_status('COMPLETED'))
            ))
        )
        result_stream = self._output.pipe(
            filter(lambda request: request['key'] == key),
            flat_map(lambda request: throw_if_error(request)),
            take_while(lambda request: not request.get('complete')),
            flat_map(lambda request: of(request.get('value')))
        )
        self._requests.on_next({'request': request, 'concurrency_group': group})
        return result_stream

    def dispose(self):
        if self._subscription:
            self._subscription.dispose()

    def __str__(self):
        return 'WorkQueue({})'.format(self._description) if self._description else super().__str__()
