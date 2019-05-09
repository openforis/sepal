import ee
from sepal.ee import radar_collection, radar_mosaic, radar_time_scan, radar_viz

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
        if not self.bands or (set(self.bands) & {'constant', 't', 'phase', 'amplitude', 'residuals'}):
            self.harmonics = 'VH'
        else:
            self.harmonics = None

    def _viz_params(self):
        if self.harmonics:
            return radar_viz.hsv_params(self.bands)
        else:
            return radar_viz.params(self.bands)

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
            harmonics=self.harmonics
        )
        if self.time_scan:
            ee_image = radar_time_scan.create(collection, self.aoi.geometry())
            if self.harmonics:
                ee_image = ee_image.addBands(ee.Image(collection.get('harmonics')))
        else:
            ee_image = radar_mosaic.create(collection, self.aoi.geometry())

        if len(self.bands):
            ee_image = ee_image.select(self.bands)

        return ee_image
