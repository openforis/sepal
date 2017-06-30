import ee

import brdf_correction
import quality_mosaic
from analyze import Analyze
from mask import Mask
from normalize import Normalize


class Mosaic(object):
    def __init__(self, mosaic_def):
        super(Mosaic, self).__init__()
        self.mosaic_def = mosaic_def

    def create(self, collection_defs):
        collection = self._map_first_pass(collection_defs)

        collection = self._map_second_pass(collection)
        if self.mosaic_def.target_day_weight:
            collection = self._map_third_pass(collection)

        if self.mosaic_def.median_mosaic:
            mosaic = collection.median()
        else:
            mosaic = quality_mosaic.create(collection)

        return mosaic \
            .select(self.mosaic_def.bands) \
            .clip(self.mosaic_def.aoi.geometry())

    def _map_first_pass(self, collection_defs):
        def first_pass(collection_def):
            def normalize_and_score(image):
                image = Normalize(image).apply(
                    collection_def.bands,
                    normalizer=collection_def.normalizer,
                    targetDay=self.mosaic_def.target_day)
                if self.mosaic_def.brdf_correct:
                    image = brdf_correction.apply(image)
                image = Analyze(image, collection_def.bands).execute()
                return image

            return collection_def.collection.map(normalize_and_score)

        def merge(c1, c2):
            return ee.ImageCollection(c1.merge(c2))

        collections = [first_pass(collection_def) for collection_def in collection_defs]
        return reduce(merge, collections)

    def _map_second_pass(self, collection):
        percentiles = collection.select(['cloudScore', 'shadowFreeCloudScore', 'clearSkyWater']) \
            .reduce(ee.Reducer.percentile([17, 50, 100]))

        def second_pass(image):
            return Mask(image) \
                .apply(
                max_cloud_score=percentiles.select('cloudScore_p100'),
                median_shadow_free_cloud_score=percentiles.select('shadowFreeCloudScore_p50'),
                mostly_water=percentiles.select('clearSkyWater_p17'),
                shadow_tolerance=self.mosaic_def.shadow_tolerance,
                mask_snow=True,
                mask_water=False) \
                .select(_scale_by_band.keys()) \
                .multiply(_scale_by_band.values()) \
                .uint16()

        return collection.map(second_pass)

    def _map_third_pass(self, collection):
        threshold = (1 - self.mosaic_def.target_day_weight) * 100
        days_from_target_threshold = collection.reduce(ee.Reducer.percentile([threshold]))

        def third_pass(image):
            return image.updateMask(
                image.select('daysFromTarget').lte(days_from_target_threshold)
            )

        return collection.map(third_pass)


class CollectionDef(object):
    """Collection definition, containing the EE collection, a dictionary with band name by normalized name,
    and a method reference to a function that normalize an image.
    """

    def __init__(self, collection, bands, normalizer=None):
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
        self.normalizer = normalizer


_scale_by_band = {
    'blue': 10000, 'green': 10000, 'red': 10000, 'nir': 10000, 'swir1': 10000, 'swir2': 10000,
    'daysFromTarget': 1, 'dayOfYear': 1, 'unixTimeDays': 1
}
