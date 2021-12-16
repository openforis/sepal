import logging

from rx import Observable, empty, of
from rx.operators import catch, concat, delay, do_action, finally_action, flat_map, group_by, map, merge, merge_all, \
    observe_on, take_until, take_while
from rx.scheduler.threadpoolscheduler import ThreadPoolScheduler
from rx.subject import Subject
from sepal.rx.operators import take_until_disposed, throw_when
from sepal.rx.retry import retry_with_backoff


class WorkQueue(object):
    def __init__(self, concurrency_per_group, delay_seconds=0, description=None):
        self._queue = Subject()
        self._description = description
        self.request_scheduler = ThreadPoolScheduler(concurrency_per_group)
        producer_scheduler = ThreadPoolScheduler(concurrency_per_group)

        def on_next(result):
            output = result['output']
            output.on_next({'value': result.get('value'), 'completed': result.get('completed')})

        self._subscription = self._queue.pipe(
            observe_on(producer_scheduler),
            group_by(lambda r: r['group']),
            flat_map(
                lambda concurrency_group: concurrency_group.pipe(
                    map(lambda r: r['work']),
                    delay(delay_seconds),
                    merge(max_concurrent=concurrency_per_group),
                    merge_all(),
                )
            ),
            take_until_disposed()
        ).subscribe(
            on_next=on_next,
            on_error=lambda error: logging.exception('Error in {} request stream'.format(self)),
            scheduler=producer_scheduler
        )

    def enqueue(
            self,
            observable: Observable,
            group: str = 'default-group',
            retries: int = 0,
            description: str = None
    ) -> Observable:
        def log_status(status):
            logging.debug(str({
                'WorkQueue': str(self),
                'group': group,
                status: description
            }))

        log_status('ENQUEUED')
        output = Subject()
        errors = Subject()
        output_finalized = Subject()

        def handle_error(e, _):
            log_status('FAILED')
            errors.on_next(e)
            return empty()

        def set_output_finalized():
            output_finalized.on_next(True)

        work = of(True).pipe(
            do_action(lambda _: log_status('STARTED')),
            take_until(output_finalized),
            flat_map(
                lambda _: observable.pipe(
                    map(lambda value: of({'value': value, 'output': output})),
                    retry_with_backoff(
                        retries=retries,
                        description='{}.enqueue(group={}, description={})'.format(self, group, description)
                    ),
                    catch(handler=handle_error),
                    take_until(output_finalized),
                    take_until_disposed()
                )
            ),
            concat(of(of({'completed': True, 'output': output}))),
            finally_action(lambda: log_status('COMPLETED'))
        )

        self._queue.on_next({'work': work, 'group': group})

        return output.pipe(
            observe_on(self.request_scheduler),
            throw_when(errors),
            take_while(lambda r: not r.get('completed')),
            map(lambda r: r.get('value')),
            finally_action(set_output_finalized)
        )

    def dispose(self):
        if self._subscription:
            self._subscription.dispose()

    def __str__(self):
        return 'WorkQueue({})'.format(self._description) if self._description else super().__str__()
