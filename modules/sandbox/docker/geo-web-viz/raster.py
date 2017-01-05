import gdal
import mapnik
import operator

from config import to_file, to_path


def band_count(raster_file):
    ds = gdal.OpenShared(raster_file)
    if not ds:
        return 0
    band = 1
    while True:
        if not ds.GetRasterBand(band):
            return band - 1
        band += 1


def band_info(raster_file, band_index):
    ds = gdal.OpenShared(raster_file)
    band = ds.GetRasterBand(band_index)
    nodata = band.GetNoDataValue()
    (min, max, mean, std_dev) = band.ComputeStatistics(False)
    if nodata is None:
        nodata = min
        band.SetNoDataValue(nodata)

    (min, max, mean, std_dev) = band.ComputeStatistics(False)
    histogram = band.GetHistogram(min, max, 256)

    # mapnik_map = _mapnik_map(raster_file, band_index, nodata)
    # envelope = mapnik_map.envelope()

    return {
        # 'envelope': [[envelope.maxx, envelope.maxy], [envelope.minx, envelope.miny]],
        'nodata': nodata,
        'min': min,
        'max': max,
        'mean': mean,
        'stdDev': std_dev,
        'histogram': histogram
    }


def from_dict(layer_dict):
    return RasterLayer(
        id=layer_dict['id'],
        file=to_file(layer_dict['path']),
        bands=_Band.from_dict(layer_dict['bands'])
    )


# def _mapnik_map(raster_file, band_index, nodata):
#     mapnik_datasource = mapnik.Gdal(
#         file=raster_file,
#         shared=True,
#         band=band_index,
#         nodata=nodata,
#         nodata_tolerance=1e-12
#     )
#     mapnik_layer = mapnik.Layer('test')
#     mapnik_layer.datasource = mapnik_datasource
#     mapnik_map = mapnik.Map(1, 1, srs='+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs')
#     mapnik_map.layers.append(mapnik_layer)
#     mapnik_map.zoom_all()
#     return mapnik_map


# noinspection PyUnresolvedReferences
class RasterLayer(object):
    """Represents a map layer."""

    def __init__(self, id, file, bands, nodata=0, nodata_tolerance=1e-12):
        """Creates a raster layer.

        :param file: Path to raster image.
        :type file: str

        :param bands: Iterable of gwv.Band instances to include.
        :type bands: iterable

        :param nodata: Value to assign pixels with no data.
        :type nodata: float

        :param nodata_tolerance: Distance from nodata value pixels still are considered nodata.
        :type nodata_tolerance: float
        """
        self.id = id
        self.file = file
        self.nodata = nodata
        self.nodata_tolerance = nodata_tolerance
        self.band_layers = [
            _BandLayer(file, band, nodata, nodata_tolerance)
            for band in bands]

    def append_to(self, map):
        """Appends Mapnik layers and styles for the bands in this layer.

        :param map: The mapnik Map.
        :type map: mapnik.Map
        """
        for band_layer in self.band_layers:
            band_layer.append_to(map)

    def to_dict(self):
        return {
            'id': self.id,
            'type': 'raster',
            'path': to_path(self.file),
            'bands': [band_layer.band.to_dict() for band_layer in self.band_layers]
        }

    def update(self, layer_dict):
        layer = self.to_dict()
        layer.update(layer_dict)
        return from_dict(layer)


class _BandLayer(object):
    def __init__(self, file, band, nodata, nodata_tolerance):
        self.file = file
        self.band = band
        self.nodata = nodata
        self.nodata_tolerance = nodata_tolerance
        self.style = self.create_style()
        self.mapnik_datasource = mapnik.Gdal(
            file=file,
            band=band.index,
            shared=True,
            nodata=self.nodata,
            nodata_tolerance=self.nodata_tolerance
        )
        self.mapnik_layer = self.create_mapnik_layer()

    def create_mapnik_layer(self):
        layer = mapnik.Layer(self.band.name)
        layer.datasource = self.mapnik_datasource
        layer.styles.append(self.band.name)
        return layer

    def create_style(self):
        symbolizer = mapnik.RasterSymbolizer()
        symbolizer.colorizer = self.create_colorizer()
        rule = mapnik.Rule()
        rule.symbols.append(symbolizer)
        style = mapnik.Style()
        style.comp_op = mapnik.CompositeOp.plus
        style.rules.append(rule)
        return style

    def create_colorizer(self):
        band = self.band
        colorizer = mapnik.RasterColorizer(mapnik.COLORIZER_LINEAR, mapnik.Color('#00000000'))
        palette = sorted(band.palette.items(), key=operator.itemgetter(0))
        for stop, color in palette:
            colorizer.add_stop(stop, mapnik.COLORIZER_LINEAR, mapnik.Color(str(color)))
        return colorizer

    def append_to(self, map):
        map.layers.append(self.mapnik_layer)
        map.append_style(self.band.name, self.style)


class _Band(object):
    """Represents a band to include in a map layer, and it's visualisation properties"""

    def __init__(self, index, palette):
        """Creates a band.

        :param index: Index of band in image.
        :type index: int

        :param min: Value to map to first color in palette.
        :type min: float

        :param max: Value to map to last color in palette.
        :type max: float

        :param palette: Iterable of hex-color strings, which will be used for the values in the band.
        :type palette: iterable
        """
        self.name = 'B' + str(index)
        self.index = index
        self.palette = palette

    def to_dict(self):
        return {
            'index': self.index,
            'palette': self.palette
        }

    @staticmethod
    def from_dict(bands_dict):
        return [
            _Band(
                index=int(band['index']),
                palette={int(stop): color for stop, color in band['palette'].iteritems()}
            )
            for band in bands_dict
            ]
