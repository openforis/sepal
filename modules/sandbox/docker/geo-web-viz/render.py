import multiprocessing

import mapnik

from mercator import SphericalMercator
from pool import Pool

_renderers = {}


def create_renderer(layer):
    _renderers[layer.id] = Renderer(layer)


def remove(layer_id):
    del _renderers[layer_id]


def render_tile(layer_id, z, x, y, fmt):
    return _renderers[layer_id].render(z, x, y, fmt)


# TODO: Improve pool - can be more clever.
# Layer can be concurrent or not. Should have a single pool, limiting concurrency to cpu_count
# If not concurrent, only one map is returned at the time, for one file

class Renderer(object):
    """Responsible for rendering a map layer"""

    def __init__(self, layer):
        """Creates renderer for provided map layer.

        :param layer: The image.
        :type layer: layer.Layer

        :param concurrent: The number of tiles to render concurrently.
        :type concurrent: int
        """
        self.max_zoom = 22
        self.size = 256
        self.buffer_size = 128

        if layer.concurrent:
            pool_size = multiprocessing.cpu_count()
        else:
            pool_size = 1
        self.pool = Pool(layer, map_size=self.size, pool_size=pool_size)

        map = mapnik.Map(256, 256, '+init=epsg:3857')
        layer.append_to(map)
        map.zoom_all()
        self.envelope = map.envelope()

        self.empty_tile = mapnik.Image(self.size, self.size)
        self.mercator = SphericalMercator(levels=self.max_zoom + 1, size=self.size)

    def render(self, z, x, y, fmt):
        """Renders tile.

        :param z: Zoom level.
        :type z: int

        :param x: X coordinate.
        :type x: int

        :param y: Y coordinate.
        :type y: int

        :param fmt: Image format.
        :type fmt: str"""
        envelope = self.mercator.xyz_to_envelope(x, y, z)
        if not self.envelope.intersects(envelope):  # skip rendering and ds query if tile will be blank
            return self.empty_tile.tostring(fmt)

        image = mapnik.Image(self.size, self.size)
        with Pool.map(self.pool) as map:
            try:
                map.zoom_to_box(envelope)
                map.buffer_size = self.buffer_size
                mapnik.render(map, image)
            except Exception as e:
                print(e)
        return image.tostring(fmt)
