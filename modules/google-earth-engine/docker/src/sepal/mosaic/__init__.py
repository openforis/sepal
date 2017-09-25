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
            if not data_set.masks_cloud_on_analysis():
                data_set_collection = mask_clouds(self.mosaic_def, data_set_collection)
            collection = ee.ImageCollection(collection.merge(data_set_collection))

        collection = mask_shadows(self.mosaic_def, collection)
        collection = mask_haze(self.mosaic_def, collection)
        collection = mask_less_green(self.mosaic_def, collection)
        collection = mask_days_from_target(self.mosaic_def, collection)

        return self._to_mosaic(collection)

    def _to_mosaic(self, collection):
        bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
        median = collection.select(bands).median()
        if self.mosaic_def.median_composite:
            mosaic = median
        else:
            def add_distance(image):
                distanceByBand = image.expression(
                    '1 - abs((i - m) / (i + m))', {
                        'i': image.select(bands),
                        'm': median.select(bands)})
                return image.addBands(
                    distanceByBand.reduce(ee.Reducer.sum()).rename(['distanceToMedian'])
                )

            collection = collection.map(add_distance)
            mosaic = collection.qualityMosaic('distanceToMedian')

        return mosaic \
            .select(bands) \
            .uint16() \
            .clip(self.mosaic_def.aoi.geometry())


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
