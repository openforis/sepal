import logging
import random

import rx
from rx import of, throw
from rx.operators import catch, delay, flat_map


def default_backoff(times):
    return min(pow(2, times * random.uniform(0.1, 0.2)), 30)


def retry_with_backoff(retries, description=None, backoff=default_backoff):
    def do_retry(source, tries, exception):
        if tries <= retries:
            logging.info('retry_with_backoff(tries={}, retries={}, exception={}, description={})'.format(
                tries, retries, exception, description))
            return of(None).pipe(
                delay(backoff(tries)),
                flat_map(source),
                catch(handler=lambda e, src: do_retry(src, tries + 1, e))
            )
        else:
            return throw(exception)

    return rx.pipe(
        catch(handler=lambda e, o: do_retry(o, 1, e))
    )
