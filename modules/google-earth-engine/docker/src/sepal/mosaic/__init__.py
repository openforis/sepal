from abc import abstractmethod

import ee

from analyze import analyze
from clouds import mask_clouds
from days_from_target import mask_days_from_target
from greenness import mask_less_green
from haze import mask_haze
from shadows import mask_shadows


class Mosaic(object):
    def __init__(self, mosaic_def):
        super(Mosaic, self).__init__()
        self.mosaic_def = mosaic_def

    def create(self, data_sets):
        collection = ee.ImageCollection([])
        for data_set in data_sets:
            data_set_collection = analyze(self.mosaic_def, data_set, data_set.to_collection())
            collection = ee.ImageCollection(collection.merge(data_set_collection))

        collection = mask_clouds(self.mosaic_def, collection)
        collection = mask_shadows(self.mosaic_def, collection)
        collection = mask_haze(self.mosaic_def, collection)
        collection = mask_less_green(self.mosaic_def, collection)
        collection = mask_days_from_target(self.mosaic_def, collection)

        bands = self._common_bands(data_sets)
        return self._to_mosaic(bands, collection)

    def _common_bands(self, data_sets):
        common_bands = list(reduce(
            lambda bands, my_bands: set(my_bands).intersection(bands),
            [data_set.bands() for data_set in data_sets]
        ))

        if not self.mosaic_def.median_composite:
            common_bands += ['unixTimeDays', 'dayOfYear', 'daysFromTarget']

        return common_bands

    def _to_mosaic(self, bands, collection):
        collection = collection.select(bands)
        distance_bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
        median = collection.select(distance_bands).median()
        if self.mosaic_def.median_composite:
            mosaic = median
        else:
            def add_distance(image):
                distanceByBand = image.expression(
                    '1 - abs((i - m) / (i + m))', {
                        'i': image.select(distance_bands),
                        'm': median.select(distance_bands)})
                return image.addBands(
                    distanceByBand.reduce(ee.Reducer.sum()).rename(['distanceToMedian'])
                )

            collection = collection.map(add_distance)
            mosaic = collection.qualityMosaic('distanceToMedian')
        # The bands might have been set - use a default set of bands if that's the case
        bands_to_select = self.mosaic_def.bands if self.mosaic_def.bands else bands
        return mosaic \
            .select(bands_to_select) \
            .uint16() \
            .clip(self.mosaic_def._aoi.geometry())


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
