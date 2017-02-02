import os
from subprocess import call

import mapnik
import ogr

from config import to_file, to_path
from layer import Layer


def create(shape_dict):
    layer = _from_dict(shape_dict)
    return layer


def _from_dict(shape_dict):
    return ShapeLayer(
        id=shape_dict['id'],
        file=to_file(shape_dict['path']),
        fill_color=shape_dict['fillColor'],
        stroke_color=shape_dict['strokeColor'],
        stroke_width=shape_dict['strokeWidth']
    )


# noinspection PyUnresolvedReferences
class ShapeLayer(Layer):
    """Represents a map layer from a shape file."""

    concurrent = True

    def __init__(self, id, file, fill_color, stroke_color, stroke_width):
        """Creates a shape layer."""
        super(ShapeLayer, self).__init__()
        self.id = id
        self.file = file
        self.fill_color = fill_color
        self.stroke_color = stroke_color
        self.stroke_width = stroke_width
        ds = mapnik.Shapefile(
            file=(os.path.splitext(file)[0])
        )
        srs = self._srs(file)
        self.mapnik_layer = mapnik.Layer('Shapefile Layer', srs)
        self.mapnik_layer.datasource = ds
        self.mapnik_layer.maximum_extent = self._extent(file)

        polygon_symbolizer = mapnik.PolygonSymbolizer()
        polygon_symbolizer.fill = mapnik.Color(str(fill_color))

        line_symbolizer = mapnik.LineSymbolizer()
        line_symbolizer.stroke = mapnik.Color(str(stroke_color))
        line_symbolizer.stroke_width = float(stroke_width)
        line_symbolizer.simplify = 0.1

        rule = mapnik.Rule()
        rule.symbols.append(polygon_symbolizer)
        rule.symbols.append(line_symbolizer)
        style = mapnik.Style()
        style.rules.append(rule)
        self.mapnik_style = style
        self.mapnik_layer.styles.append('Shapefile Layer')

    def _extent(self, file):
        ds = ogr.Open(file)
        layer = ds.GetLayerByIndex(0)
        extent = layer.GetExtent()
        return mapnik.Box2d(extent[0], extent[2], extent[1], extent[3])

    def _srs(self, file):
        ds = ogr.Open(file)
        layer = ds.GetLayerByIndex(0)
        srs = layer.GetSpatialRef()
        epsg = srs.GetAuthorityCode('PROJCS')
        if epsg:
            return '+init=epsg:' + epsg
        epsg = srs.GetAuthorityCode('GEOGCS')
        if epsg:
            return '+init=epsg:' + epsg
        return srs.ExportToProj4()

    def append_to(self, map):
        """Appends this shape to provided Mapnik map.

        :param map: The mapnik Map.
        :type map: mapnik.Map
        """
        map.append_style('Shapefile Layer', self.mapnik_style)
        map.layers.append(self.mapnik_layer)

    def to_dict(self):
        return {
            'id': self.id,
            'type': 'shape',
            'path': to_path(self.file),
            'fillColor': self.fill_color,
            'strokeColor': self.stroke_color,
            'strokeWidth': self.stroke_width,
            'bounds': self.bounds()
        }

    def update(self, shape_dict):
        layer = self.to_dict()
        layer.update(shape_dict)
        return _from_dict(layer)

    def features(self, lat, lng):
        return self.layer_features(0, lat, lng)
