from abc import abstractmethod
from functools import reduce

import ee

from .analyze import analyze, additional_bands
from .clouds import mask_clouds
from .days_from_target import mask_days_from_target
from .greenness import mask_less_green
from .haze import mask_haze
from .shadows import mask_shadows


class Mosaic(object):
    def __init__(self, mosaic_def):
        super(Mosaic, self).__init__()
        self.mosaic_def = mosaic_def

    def create(self, data_sets):
        collection = ee.ImageCollection([])
        common_bands = self._common_bands(data_sets)
        for data_set in data_sets:
            data_set_collection = analyze(self.mosaic_def, data_set, data_set.to_collection()).select(
                common_bands + additional_bands()
            )
            collection = ee.ImageCollection(collection.merge(data_set_collection))

        collection = mask_clouds(self.mosaic_def, collection)
        collection = mask_shadows(self.mosaic_def, collection)
        if not self.mosaic_def.surface_reflectance:
            collection = mask_haze(self.mosaic_def, collection)
        collection = mask_less_green(self.mosaic_def, collection)
        collection = mask_days_from_target(self.mosaic_def, collection)

        do_tasseled_cap = set(_tasseled_cap_bands) & set(self.mosaic_def.bands)
        bands = list(set(common_bands + _optical_bands))
        bands_to_select = self.mosaic_def.bands if self.mosaic_def.bands and len(self.mosaic_def.bands) > 0 else bands
        mosaic_bands = bands_to_select
        if do_tasseled_cap:
            mosaic_bands = list(set(bands_to_select + _optical_bands) - set(_tasseled_cap_bands))
        mosaic = self._to_mosaic(mosaic_bands, collection)
        if do_tasseled_cap:
            mosaic = self._tasseled_cap(mosaic)
        return mosaic \
            .select(bands_to_select)

    def _tasseled_cap(self, image):
        coefficients = ee.Array([
            [0.3037, 0.2793, 0.4743, 0.5585, 0.5082, 0.1863],
            [-0.2848, -0.2435, -0.5436, 0.7243, 0.0840, -0.1800],
            [0.1509, 0.1973, 0.3279, 0.3406, -0.7112, -0.4572],
            [-0.8242, 0.0849, 0.4392, -0.0580, 0.2012, -0.2768],
            [-0.3280, 0.0549, 0.1075, 0.1855, -0.4357, 0.8085],
            [0.1084, -0.9022, 0.4120, 0.0573, -0.0251, 0.0238]
        ])

        arrayImage1D = image.select(_optical_bands).divide(10000).toArray()
        arrayImage2D = arrayImage1D.toArray(1)

        return image.addBands(
            ee.Image(coefficients)
                .matrixMultiply(arrayImage2D)
                .arrayProject([0])
                .arrayFlatten([_tasseled_cap_bands])
                .multiply(10000)
                .int16()
        )

    def _common_bands(self, data_sets):
        common_bands = list(reduce(
            lambda bands, my_bands: set(my_bands).intersection(bands),
            [data_set.bands() for data_set in data_sets]
        ))

        if not self.mosaic_def.median_composite:
            common_bands += ['unixTimeDays', 'dayOfYear', 'daysFromTarget']

        return common_bands

    def _to_mosaic(self, bands, collection):
        if self.mosaic_def.median_composite:
            mosaic = collection.select(bands).median()
        else:
            distance_bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']

            def add_distance(image):
                distanceByBand = image.expression(
                    '1 - abs((i - m) / (i + m))', {
                        'i': image.select(distance_bands),
                        'm': collection.select(distance_bands).median()})
                return image.addBands(
                    distanceByBand.reduce(ee.Reducer.sum()).rename(['distanceToMedian'])
                )

            collection = collection.map(add_distance)
            mosaic = collection.qualityMosaic('distanceToMedian')
        return mosaic \
            .select(bands) \
            .int16() \
            .clip(self.mosaic_def.aoi.geometry())

    def _bands_to_select(self, bands):
        if self.mosaic_def.bands and len(self.mosaic_def.bands) > 0:
            return self.mosaic_def.bands
        else:
            return bands


class DataSet(object):
    @abstractmethod
    def to_collection(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    @abstractmethod
    def bands(self):
        raise AssertionError('Method in subclass expected to have been invoked')

    @abstractmethod
    def analyze(self, image):
        raise AssertionError('Method in subclass expected to have been invoked')

    @abstractmethod
    def masks_cloud_on_analysis(self):
        raise AssertionError('Method in subclass expected to have been invoked')


_optical_bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
_tasseled_cap_bands = ['brightness', 'greenness', 'wetness', 'fourth', 'fifth', 'sixth']
