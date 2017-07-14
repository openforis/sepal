import ee

from first_pass import FirstPass
from second_pass import SecondPass


class Mosaic(object):
    def __init__(self, mosaic_def):
        super(Mosaic, self).__init__()
        self.mosaic_def = mosaic_def

    def create(self, collection_defs):
        # collection_def = collection_defs[0]
        # image = ee.Image(collection_def.collection.first())
        # mosaic = FirstPass(image).apply(
        #     mosaic_def=self.mosaic_def,
        #     collection_def=collection_def)

        collection = self._map_first_pass(collection_defs)
        collection = self._map_second_pass(collection)
        if self.mosaic_def.target_day_weight:
            collection = self._map_third_pass(collection)
        mosaic = self._to_mosaic(collection)
        return mosaic \
            .select(self.mosaic_def.bands) \
            .clip(self.mosaic_def.aoi.geometry())

    def _map_first_pass(self, collection_defs):
        def first_pass(collection_def):
            def apply(image):
                return FirstPass(image).apply(
                    mosaic_def=self.mosaic_def,
                    collection_def=collection_def)

            return collection_def.collection.map(apply)

        def merge(c1, c2):
            return ee.ImageCollection(c1.merge(c2))

        collections = [first_pass(collection_def) for collection_def in collection_defs]
        return reduce(merge, collections)

    def _map_second_pass(self, collection):

        reduced = collection \
            .select(['waterCloudScore', 'landCloudScore', 'shadowFreeCloudScore', 'waterBlue']) \
            .reduce(ee.Reducer.percentile([50, 100]).combine(ee.Reducer.stdDev(), "", True))

        waterBlueStd = reduced.select('waterBlue_stdDev')
        maybeWater = waterBlueStd.updateMask(waterBlueStd.gt(20).And(waterBlueStd.lt(900)))
        maybeWater = maybeWater.mask().reduce('min').eq(1)

        def second_pass(image):
            return SecondPass(image).apply(
                maybeWater,
                reduced.select('waterCloudScore_p100'),
                reduced.select('landCloudScore_p100'),
                reduced.select('shadowFreeCloudScore_p50'),
                self.mosaic_def)

        return collection.map(second_pass)

    def _map_third_pass(self, collection):
        threshold = (1 - self.mosaic_def.target_day_weight) * 100
        days_from_target_threshold = collection.reduce(ee.Reducer.percentile([threshold]))

        def third_pass(image):
            return image.updateMask(
                image.select('daysFromTarget').lte(days_from_target_threshold)
            )

        return collection.map(third_pass)

    def _to_mosaic(self, collection):
        bands = ['blue', 'green', 'red', 'nir', 'swir1', 'swir2']
        median = collection.median()
        if self.mosaic_def.median_composite:
            mosaic = median
        else:
            def distance_to_median(image):
                distanceByBand = image.expression(
                    '1 - abs((i - m) / (i + m))', {
                        'i': image.select(bands),
                        'm': median.select(bands)})
                return image.addBands(
                    distanceByBand.reduce(ee.Reducer.sum()).rename(['distanceToMedian'])
                )

            collection = collection.map(distance_to_median)
            mosaic = collection.qualityMosaic('distanceToMedian')

        return mosaic


class CollectionDef(object):
    def __init__(self, collection, bands, first_pass):
        """Creates a CollectionDef.
        :param collection: The EE image collection.
        :type collection: ee.ImageCollection

        :param bands: A dict of image band name by normalized band name.
        :type bands: dict

        :param multiplier: Value to multiply image with to between 0 and 10,000.
        :type multiplier: float
        """
        self.collection = collection
        self.bands = bands
        self.first_pass = first_pass
