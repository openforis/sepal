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
        self.bands = spec['bands']
        self.median_composite = spec.get('median_composite', False)
        self.mask_snow = spec.get('maskSnow', True)
        self.brdf_correct = bool(spec.get('brdfCorrect', True))
        self.from_date = spec.get('fromDate', None)
        self.to_date = spec.get('toDate', None)

    def _viz_params(self):
        return _viz_by_bands[', '.join(self.bands)]({
            'from_days_since_epoch': self.from_date / _milis_per_day,
            'to_days_since_epoch': self.to_date / _milis_per_day
        })

    def _ee_image(self):
        logging.info('Creating mosaic of ' + str(self))
        return Mosaic(self).create(self._collection_defs())

    @abstractmethod
    def _collection_defs(self):
        """Creates an ee.Image based on the spec.

        :return: A list of mosaic.CollectionDef instances
        :rtype: list
        """
        raise AssertionError('Method in subclass expected to have been invoked')


_viz_by_bands = {
    'red, green, blue': lambda params: {'bands': 'red, green, blue', 'min': 0, 'max': 5000,
                                        'gamma': '2.0, 2.1, 1.8'},
    'nir, red, green': lambda params: {'bands': 'nir, red, green', 'min': 0, 'max': 5000, 'gamma': 1.7},
    'nir, swir1, red': lambda params: {'bands': 'nir, swir1, red', 'min': 0, 'max': 5000, 'gamma': 1.7},
    'swir2, nir, red': lambda params: {'bands': 'swir2, nir, red', 'min': 0, 'max': 5000, 'gamma': 1.7},
    'swir2, swir1, red': lambda params: {'bands': 'swir2, swir1, red', 'min': 0, 'max': 5000, 'gamma': 1.7},
    'swir2, nir, green': lambda params: {'bands': 'swir2, nir, green', 'min': 0, 'max': 5000, 'gamma': 1.7},
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
