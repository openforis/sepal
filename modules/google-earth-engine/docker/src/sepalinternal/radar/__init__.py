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
        self.harmonics_dependents = [
            dependent
            for dependent in ['VV', 'VH']
            if self._contains_harmonics_band(dependent)
        ]
        if not self.scale:
            self.set_scale()

    def set_scale(self):
        self.scale = 20

    def _viz_params(self):
        if self.harmonics_dependents:
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
            harmonics_dependents=self.harmonics_dependents
        )
        if self.time_scan:
            ee_image = radar_time_scan.create(collection, self.aoi.geometry())
        else:
            ee_image = radar_mosaic.create(collection, self.aoi.geometry())

        if self.harmonics_dependents:
            ee_image = ee_image.addBands(ee.Image(collection.get('harmonics')))

        if len(self.bands):
            ee_image = ee_image.select(self.bands)

        return ee_image

    def _contains_harmonics_band(self, dependent):
        harmonics_bands = ['constant', 't', 'phase', 'amplitude', 'residuals']
        return \
            not self.bands \
            or set(self.bands) & set(['{0}_{1}'.format(dependent, band) for band in harmonics_bands])
