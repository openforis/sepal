import Queue
from contextlib import contextmanager

import mapnik


class Pool(object):
    """A pool of Mapnik maps for a layer."""

    def __init__(self, layer, map_size, pool_size):
        self.layer = layer
        self.map_size = map_size
        self.max_pool_size = pool_size
        self.queue = Queue.Queue()
        for i in range(pool_size):
            self.queue.put(self._create())

    def _create(self):
        map = mapnik.Map(self.map_size, self.map_size, '+init=epsg:3857')
        self.layer.append_to(map)
        return map

    def _take(self):
        return self.queue.get()

    def _return(self, obj):
        self.queue.put(obj)

    @contextmanager
    def map(pool):
        obj = pool._take()
        try:
            yield obj
        except Exception, e:
            yield None
            raise e
        finally:
            pool._return(obj)
