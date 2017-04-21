import ee

import constants
import image_adjustment
import util
from .. import Aoi, ImageSpec


class Sentinel2MosaicSpec(ImageSpec):
    def __init__(self, spec):
        super(Sentinel2MosaicSpec, self).__init__()
        self.aoi = Aoi.create(spec['aoi'])
        self.target_day_of_year = int(spec['targetDayOfYear'])
        self.target_day_of_year_weight = float(spec['targetDayOfYearWeight'])
        self.bands = [getattr(util, band) for band in spec['bands']]
        self.scale = min([
            resolution
            for band, resolution
            in constants.scale_by_band.iteritems()
            if band in self.bands
        ])
        self.strategy = spec.get('strategy', constants.default_strategy)
        self.classes_to_mask = spec.get('classesToMask', constants.default_classes_to_mask)

    def _viz_params(self):
        return constants.viz_by_bands[', '.join(self.spec['bands'])]({
            'from_days_since_epoch': self.from_date / constants.milis_per_day,
            'to_days_since_epoch': self.to_date / constants.milis_per_day
        })

    def _create_mosaic(self, image_collection):
        """Creates a mosaic, clipped to the area of interest, containing the specified bands.

        :param image_collection: The image collection to create a mosaic for.
        :type image_collection: ee.ImageCollection

        :return: An ee.Image.
        """
        image_collection = image_adjustment.apply(image_collection, self)
        mosaic = constants.mosaic_strategies[self.strategy](image_collection)
        return mosaic \
            .clip(self.aoi.geometry()) \
            .select(self.bands) \
            .uint16()
