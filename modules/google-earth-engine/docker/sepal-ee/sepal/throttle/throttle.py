import logging
import random

from rx import of, throw
from rx.operators import catch, concat, do_action, first, flat_map, group_by, map, merge, take_while
from rx.subject import ReplaySubject, Subject


class Throttler(object):
    _requests = Subject()
    _output = ReplaySubject()

    def __init__(self, concurrency_per_group):
        self.subscription = self._requests.pipe(
            group_by(lambda r: r['concurrency_group']),
            flat_map(
                lambda concurrency_group: concurrency_group.pipe(
                    map(lambda r: r['request']),
                    merge(max_concurrent=concurrency_per_group),
                    group_by(lambda request: request['key']),
                )
            )
        ).subscribe(
            lambda request: self._output.on_next(request),
            lambda error: logging.exception('Error in throttler'),
            lambda: logging.error('Throttler stream unexpectedly completed')
        )

    def throttle(self, observable, concurrency_group):
        key = random.random()
        error = None

        def handle_error(e):
            nonlocal error
            error = e
            return of({'key': key, 'error': e})

        def throw_if_error(request):
            if error:
                return throw(error)
            else:
                return of(request)

        request = of(True).pipe(
            flat_map(
                lambda _: observable.pipe(
                    map(lambda value: {'key': key, 'value': value}),
                    catch(handler=lambda e, o: handle_error(e))
                )
            ),
            concat(of({'key': key, 'complete': True}))
        )
        self._requests.on_next({'request': request, 'concurrency_group': concurrency_group})
        return self._output.pipe(
            first(lambda group: group.key == key),
            flat_map(lambda group: group.pipe(
                flat_map(lambda request: throw_if_error(request)),
                take_while(lambda request: not request.get('complete')),
                flat_map(lambda request: of(request.get('value')))
            ))
        )

    def dispose(self):
        if self.subscription:
            self.subscription.dispose()
