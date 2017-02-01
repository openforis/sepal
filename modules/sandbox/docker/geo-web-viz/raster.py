import os

import gdal
import mapnik
import osr

from config import to_file, to_path
from layer import Layer


def create(layer_dict):
    layer = _from_dict(layer_dict)
    layer._update_file()
    _build_overviews(layer)
    return layer


def band_count(raster_file):
    return _open_readonly(raster_file).RasterCount


def read_nodata(raster_file):
    ds = _open_readonly(raster_file)
    return ds.GetRasterBand(1).GetNoDataValue()


def band_info(raster_file, band_index, nodata):
    ds = _open_writable(raster_file)
    band = ds.GetRasterBand(band_index)
    file_nodata = band.GetNoDataValue()
    try:
        if nodata:
            if nodata != file_nodata:
                band.SetNoDataValue(nodata)
        else:
            band.DeleteNoDataValue()

        (min, max, mean, std_dev) = band.ComputeStatistics(False)
        histogram = band.GetHistogram(min, max, 256, approx_ok=0)

    finally:
        if file_nodata:
            band.SetNoDataValue(file_nodata)
        elif band.GetNoDataValue():
            band.DeleteNoDataValue()
        if nodata != file_nodata:
            _remove_stats(ds)  # Stats doesn't match the file's nodata value, delete them
    return {
        'min': min,
        'max': max,
        'mean': mean,
        'stdDev': std_dev,
        'histogram': histogram
    }


def _open_writable(raster_file):
    for retry in range(1, 3):
        ds = gdal.OpenShared(raster_file, gdal.GA_Update)
        if ds:
            return ds
    raise Exception('Unable to open file: ' + str(raster_file))


def _open_readonly(raster_file):
    for retry in range(1, 3):
        ds = gdal.OpenShared(raster_file)
        if ds:
            return ds
    raise Exception('Unable to open file: ' + str(raster_file))


def _remove_stats(ds):
    files_to_delete = [
        related_file
        for related_file in ds.GetFileList()
        if related_file.endswith('.aux.xml')]
    for file_to_delete in files_to_delete:
        _remove_file(file_to_delete)


def _remove_file(file_to_delete):
    try:
        os.remove(file_to_delete)
    except:
        pass


def _build_overviews(layer):
    ds = _open_readonly(layer.file)
    bands_without_index = [
        index
        for index in range(1, band_count(layer.file))
        if not ds.GetRasterBand(index).GetOverviewCount()
    ]
    if bands_without_index:
        ds.BuildOverviews(resampling='average', overviewlist=[2, 4, 8])


def _from_dict(layer_dict):
    nodata = layer_dict.get('nodata', None)
    if nodata:
        nodata = float(nodata)
    return RasterLayer(
        id=layer_dict['id'],
        file=to_file(layer_dict['path']),
        nodata=nodata,
        bands=_Band.from_dict(layer_dict['bands'])
    )


# noinspection PyUnresolvedReferences
class RasterLayer(Layer):
    """Represents a map layer."""

    concurrent = False

    def __init__(self, id, file, nodata, bands):
        """Creates a raster layer.

        :param file: Path to raster image.
        :type file: str

        :param bands: Iterable of gwv.Band instances to include.
        :type bands: iterable
        """
        super(RasterLayer, self).__init__()
        self.id = id
        self.file = file
        self.nodata = nodata
        # self._add_overview(bands)
        self.band_layers = [
            _BandLayer(file, band, nodata)
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
            'nodata': self.nodata,
            'bands': [band_layer.band.to_dict() for band_layer in self.band_layers],
            'bounds': self.bounds()
        }

    def update(self, layer_dict):
        layer = self.to_dict()
        layer.update(layer_dict)
        updated_layer = _from_dict(layer)
        updated_layer._update_file()
        return updated_layer

    def features(self, lat, lng):
        return [
            self.band_value(band_layer, lat, lng)
            for band_layer in self.band_layers
        ]

    def band_value(self, band_layer, lat, lng):
        features = self.layer_features(band_layer.band.index - 1, lat, lng)
        if features:
            return features[0]['value']
        return None

    def _update_file(self):
        ds = _open_writable(self.file)
        for band_index in range(1, band_count(self.file)):
            band = ds.GetRasterBand(band_index)
            if self.nodata:
                band.SetNoDataValue(self.nodata)
            else:
                band.DeleteNoDataValue()

    def _flatten(self, items):
        if items == []:
            return items
        if isinstance(items[0], list):
            return self._flatten(items[0]) + self._flatten(items[1:])
        return items[:1] + self._flatten(items[1:])


class _BandLayer(object):
    def __init__(self, file, band, nodata):
        self.file = file
        self.band = band
        self.style = self.create_style()
        self.mapnik_datasource = mapnik.Gdal(
            file=file,
            band=band.index,
            nodata=nodata,
            shared=True
        )
        self.mapnik_layer = self.create_mapnik_layer()

    def create_mapnik_layer(self):
        layer = mapnik.Layer(self.band.name)
        layer.srs = self.extract_srs(self.file)
        layer.datasource = self.mapnik_datasource
        layer.styles.append(self.band.name)
        return layer

    def extract_srs(self, file):
        ds = gdal.Open(file)
        projInfo = ds.GetProjection()
        spatialRef = osr.SpatialReference()
        spatialRef.ImportFromWkt(projInfo)
        return spatialRef.ExportToProj4()

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
        for stop, color in band.palette:
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
                palette=band['palette']
            )
            for band in bands_dict
        ]
