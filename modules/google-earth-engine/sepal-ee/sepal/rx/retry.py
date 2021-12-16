import logging
import random
from typing import Callable, Optional

import rx
from rx import Observable, of
from rx.core.typing import Mapper
from rx.operators import catch, delay, flat_map
from rx.scheduler import TimeoutScheduler
from sepal.rx import throw


def default_backoff(times):
    return min(pow(2, times * random.uniform(0.1, 0.2)), 30)


def retry_with_backoff(
        retries: int = 0,
        description: str = None,
        backoff: Optional[Mapper] = default_backoff
) -> Callable[[Observable], Observable]:
    def do_retry(source, tries, exception):
        if tries <= retries:
            logging.exception(
                'retry_with_backoff(tries={}, retries={}, exception={}, description={})'.format(
                    tries, retries, exception, description
                ))
            return of(None).pipe(
                delay(backoff(tries), TimeoutScheduler.singleton()),
                flat_map(source),
                catch(handler=lambda e, src: do_retry(src, tries + 1, e))
            )
        else:
            return throw(exception)

    return rx.pipe(
        catch(handler=lambda e, o: do_retry(o, 1, e))
    )
