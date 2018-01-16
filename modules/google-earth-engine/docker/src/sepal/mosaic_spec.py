import logging
from abc import abstractmethod

from aoi import Aoi
from image_spec import ImageSpec
from mosaic import Mosaic


class MosaicSpec(ImageSpec):
    def __init__(self, spec):
        super(MosaicSpec, self).__init__()
        self.spec = spec
        self.aoi = Aoi.create(spec['aoi'])
        self.target_day = int(spec.get('targetDayOfYear', 1))
        self.target_day_weight = float(spec.get('targetDayOfYearWeight', 0))
        self.shadow_tolerance = float(spec.get('shadowTolerance', 1))
        self.haze_tolerance = float(spec.get('hazeTolerance', 0.05))
        self.greenness_weight = float(spec.get('greennessWeight', 0))
        self.bands = spec.get('bands', [])
        self.median_composite = spec.get('median_composite', False)
        self.mask_clouds = spec.get('maskClouds', False)
        self.mask_snow = spec.get('maskSnow', False)
        self.brdf_correct = bool(spec.get('brdfCorrect', False))
        self.from_date = spec.get('fromDate', None)
        self.to_date = spec.get('toDate', None)
        self.surface_reflectance = bool(spec.get('surfaceReflectance', False))
        self.masked_on_analysis = self.surface_reflectance
        self.pan_sharpen = bool(spec.get('panSharpening', False))

    def _viz_params(self):
        viz_by_band = _sr_viz_by_bands if self.surface_reflectance else _toa_viz_by_bands
        return viz_by_band[', '.join(self.bands)]({
            'from_days_since_epoch': self.from_date / _milis_per_day,
            'to_days_since_epoch': self.to_date / _milis_per_day
        })

    def _ee_image(self):
        logging.info('Creating mosaic of ' + str(self))
        return Mosaic(self).create(self._data_sets())

    @abstractmethod
    def _data_sets(self):
        raise AssertionError('Method in subclass expected to have been invoked')


_toa_viz_by_bands = {
    'red, green, blue': lambda params: {
        'bands': 'red, green, blue',
        'min': '200, 400, 600',
        'max': '2400, 2200, 2400',
        'gamma': 1.2},
    'nir, red, green': lambda params: {
        'bands': 'nir, red, green',
        'min': '500, 200, 400',
        'max': '5000, 2400, 2200'},
    'nir, swir1, red': lambda params: {
        'bands': 'nir, swir1, red',
        'min': 0,
        'max': 5000,
        'gamma': 1.5},
    'swir2, nir, red': lambda params: {
        'bands': 'swir2, nir, red',
        'min': '0, 500, 200',
        'max': '1800, 6000, 3500'},
    'swir2, swir1, red': lambda params: {
        'bands': 'swir2, swir1, red',
        'min': '0, 500, 200',
        'max': '1800, 3000, 2400'},
    'swir2, nir, green': lambda params: {
        'bands': 'swir2, nir, green',
        'min': '0, 500, 400',
        'max': '1800, 6000, 3500'},
    'unixTimeDays': lambda params: {
        'bands': 'unixTimeDays',
        'min': params['from_days_since_epoch'],
        'max': params['to_days_since_epoch'],
        'palette': '00FFFF, 000099'
    },
    'dayOfYear': lambda params: {
        'bands': 'dayOfYear',
        'min': 0,
        'max': 183,
        'palette': '00FFFF, 000099'
    },
    'daysFromTarget': lambda params: {
        'bands': 'daysFromTarget',
        'min': 0,
        'max': 183,
        'palette': '00FF00, FF0000'
    },
}

_sr_viz_by_bands = {
    'red, green, blue': lambda params: {
        'bands': 'red, green, blue',
        'min': '300, 100, 0',
        'max': '2500, 2500, 2300',
        'gamma': 1.3},
    'nir, red, green': lambda params: {
        'bands': 'nir, red, green',
        'min': '500, 200, 100',
        'max': '5000, 2400, 2500'},
    'nir, swir1, red': lambda params: {
        'bands': 'nir, swir1, red',
        'min': 0,
        'max': '5000, 5000, 3000',
        'gamma': 1.3},
    'swir2, nir, red': lambda params: {
        'bands': 'swir2, nir, red',
        'min': '100, 500, 300',
        'max': '2000, 6000, 2500'},
    'swir2, swir1, red': lambda params: {
        'bands': 'swir2, swir1, red',
        'min': '100, 200, 300',
        'max': '3300, 4800, 3100'},
    'swir2, nir, green': lambda params: {
        'bands': 'swir2, nir, green',
        'min': '100, 500, 400',
        'max': '3300, 7500, 3000'},
    'unixTimeDays': lambda params: {
        'bands': 'unixTimeDays',
        'min': params['from_days_since_epoch'],
        'max': params['to_days_since_epoch'],
        'palette': '00FFFF, 000099'
    },
    'dayOfYear': lambda params: {
        'bands': 'dayOfYear',
        'min': 0,
        'max': 183,
        'palette': '00FFFF, 000099'
    },
    'daysFromTarget': lambda params: {
        'bands': 'daysFromTarget',
        'min': 0,
        'max': 183,
        'palette': '00FF00, FF0000'
    },
}

_milis_per_day = 1000 * 60 * 60 * 24
