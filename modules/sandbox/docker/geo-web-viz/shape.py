import os

import mapnik
import osgeo.ogr

from config import to_file, to_path


def from_dict(shape_dict):
    return ShapeLayer(
        id=shape_dict['id'],
        file=to_file(shape_dict['path']),
        fill_color=shape_dict['fillColor'],
        stroke_color=shape_dict['strokeColor'],
        stroke_width=shape_dict['strokeWidth']
    )


# noinspection PyUnresolvedReferences
class ShapeLayer(object):
    """Represents a map layer from a shape file."""

    def __init__(self, id, file, fill_color, stroke_color, stroke_width):
        """Creates a shape layer."""
        self.id = id
        self.file = file
        self.fill_color = fill_color
        self.stroke_color = stroke_color
        self.stroke_width = stroke_width
        datasource = mapnik.Shapefile(
            file=(os.path.splitext(file)[0])
        )
        srs = self._srs(file)
        self.mapnik_layer = mapnik.Layer('Shapefile Layer', srs)
        self.mapnik_layer.datasource = datasource
        extent = self._extent(file)
        self.mapnik_layer.maximum_extent = extent

        polygon_symbolizer = mapnik.PolygonSymbolizer()
        polygon_symbolizer.fill = mapnik.Color('#00ff0055')

        line_symbolizer = mapnik.LineSymbolizer()
        line_symbolizer.stroke = mapnik.Color('#ff0000')
        line_symbolizer.stroke_width = 0.1

        rule = mapnik.Rule()
        rule.symbols.append(polygon_symbolizer)
        rule.symbols.append(line_symbolizer)
        style = mapnik.Style()
        style.rules.append(rule)
        self.mapnik_style = style
        self.mapnik_layer.styles.append('Shapefile Layer')

    def _extent(self, file):
        ds = osgeo.ogr.Open(file)
        layer = ds.GetLayerByIndex(0)
        extent = layer.GetExtent()
        return mapnik.Box2d(extent[0], extent[2], extent[1], extent[3])

    def _srs(self, file):
        ds = osgeo.ogr.Open(file)
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
            'fill_color': self.fill_color,
            'stroke_color': self.stroke_color,
            'stroke_width': self.stroke_width
        }

    def update(self, shape_dict):
        layer = self.to_dict()
        layer.update(shape_dict)
        return from_dict(layer)
