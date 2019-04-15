from sepal.ee import radar_collection, radar_mosaic, radar_time_scan

from ..aoi import Aoi
from ..image_spec import ImageSpec


class RadarMosaic(ImageSpec):
    def __init__(self, spec):
        super(RadarMosaic, self).__init__()
        self.spec = spec
        self.model = spec['recipe']['model']
        self.aoi = Aoi.create(spec['recipe']['model']['aoi'])
        self.bands = spec['bands']
        self.time_scan = not self.model['dates'].get('targetDate')
        self.scale = spec.get('scale', 20)

    def _viz_params(self):
        if self.time_scan:
            return radar_time_scan.viz_params(self.bands)
        else:
            return radar_mosaic.viz_params(self.bands)

    def _ee_image(self):
        dates = self.model['dates']
        options = self.model['options']
        collection = radar_collection.create(
            region=self.aoi.geometry(),
            start_date=dates.get('fromDate'),
            end_date=dates.get('toDate'),
            target_date=dates.get('targetDate'),
            orbits=options['orbits'],
            geometric_correction=options['geometricCorrection'],
            speckle_filter=options['speckleFilter'],
            outlier_removal=options['outlierRemoval'],
        )
        if self.time_scan:
            return radar_time_scan.create(collection, self.aoi.geometry(), self.bands)
        else:
            return radar_mosaic.create(collection, self.aoi.geometry(), self.bands)
