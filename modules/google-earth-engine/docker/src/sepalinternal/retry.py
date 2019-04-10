import logging
import random
import time

from exception import re_raisable

logger = logging.getLogger(__name__)


def retry(action, name, times=5):
    try:
        return action()
    except Exception as e:
        if times < 20:
            throttle_seconds = max(2 ^ int(times * random.uniform(0.1, 0.2), 30))
            logger.warn('Retrying "{0}" in {1} seconds: {2}'.format(name, throttle_seconds, str(e)))
            time.sleep(throttle_seconds)
            return retry(action, times + 1)
        re_raisable()
        raise e
