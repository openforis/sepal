from ..image_spec import ImageSpec
from sepal.ee import radar_collection, radar_mosaic, radar_time_scan
from ..aoi import Aoi


class RadarMosaic(ImageSpec):
    def __init__(self, spec):
        super(RadarMosaic, self).__init__()
        self.spec = spec
        self.model = spec['recipe']['model']
        self.aoi = Aoi.create(spec['recipe']['model']['aoi'])
        self.bands = spec['bands']
        self.time_scan = not self.model['dates'].get('targetDate')

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
            corrections=options['corrections'],
            mask=options['mask'],
            speckle_filter=options['speckleFilter'],
            orbits=options['orbits']
        )
        if self.time_scan:
            return radar_time_scan.create(collection, self.aoi.geometry(), self.bands)
        else:
            return radar_mosaic.create(collection, self.aoi.geometry(), self.bands)
