import types

import sys


def re_raisable():
    type, exception, traceback = sys.exc_info()

    # noinspection PyUnusedLocal
    def re_raise(self):
        raise type(exception).with_traceback(traceback)

    exception.re_raise = types.MethodType(re_raise, exception)
    return exception
