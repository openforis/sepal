import ee

import constants
import image_adjustment
from .. import Aoi, ImageSpec


class LandsatMosaicSpec(ImageSpec):
    def __init__(self, spec):
        super(LandsatMosaicSpec, self).__init__()
        self.aoi = Aoi.create(spec['aoi'])
        self.target_day_of_year = int(spec['targetDayOfYear'])
        self.target_day_of_year_weight = float(spec['targetDayOfYearWeight'])
        self.bands = spec['bands']
        self.strategy = spec.get('strategy', constants.default_strategy)
        self.classes_to_mask = spec.get('classesToMask', constants.default_classes_to_mask)

    def _viz_params(self):
        return constants.viz_by_bands[', '.join(self.bands)]({
            'from_days_since_epoch': self.from_date / constants.milis_per_day,
            'to_days_since_epoch': self.to_date / constants.milis_per_day
        })

    def _create_mosaic(self, image_collections):
        """Creates a mosaic, clipped to the area of interest, containing the specified bands.

        :param image_collection: The image collections to create a mosaic for.
            All collections must have normalized band names.
        :type image_collection: iterable

        :return: An ee.Image.
        """
        image_collection = self._merge(image_collections)
        image_collection = image_adjustment.apply(image_collection, self)
        mosaic = constants.mosaic_strategies[self.strategy](image_collection)
        return mosaic \
            .clip(self.aoi.geometry()) \
            .select(self.bands) \
            .multiply(10000) \
            .int()

    def _merge(self, image_collections):
        return reduce(self._merge_two, image_collections)

    def _merge_two(self, collection_a, collection_b):
        """Merges two image collections into a single image collection, making sure band names are preserved.

        This expects both collections to have normalized band names.

        :param collection_a: First image collection.
        :type collection_a: ee.ImageCollection

        :param collection_b: Second image collection.
        :type collection_b: ee.ImageCollection

        :return: An ee.ImageCollection containing the elements from both collections.
        """
        return ee.ImageCollection(
            collection_a.merge(collection_b).set('bands', constants.normalized_band_names))

    def _normalize_band_names(self, image, collection_name):
        """Normalizes the band names of the provided image.

        :param image: The image to normalize the band names for.
        :type image: ee.Image

        :param collection_name: The image collection name of the image.
        :type collection_name: str

        :return: An ee.Image with normalized band names.
        """
        return image.select(constants.bands_by_collection_name[collection_name], constants.normalized_band_names)
