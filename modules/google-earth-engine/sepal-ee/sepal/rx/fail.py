import random

from rx.operators import map, pipe


def randomly(frequency):
    def fail(v):
        if random.random() < frequency:
            raise Exception('Randomly failed')
        else:
            return v

    return pipe(map(fail))
