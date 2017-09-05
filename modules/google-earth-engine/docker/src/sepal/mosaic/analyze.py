import brdf_correction
from ..image_operation import ImageOperation
import ee

def analyze(mosaic_def, data_set, collection):
    def apply(image):
        return _Analyze(image, mosaic_def, data_set).apply()
    return collection.map(apply)


class _Analyze(ImageOperation):
    def __init__(self, image, mosaic_def, data_set):
        super(_Analyze, self).__init__(image)
        self.mosaic_def = mosaic_def
        self.data_set = data_set

    def apply(self):
        self._normalize_band_names()
        self.image = self.data_set.analyze(self.image)
        self._add_date_bands()

        if self.mosaic_def.mask_snow:
            self.updateMask('!i.snow')

        if self.mosaic_def.brdf_correct:
            self.image = brdf_correction.apply(self.image)

        self._scale_image()
        return self.image

    def _normalize_band_names(self):
        bands = self.data_set.bands()
        self.image = self.image.select(list(bands.values()), list(bands.keys()))

    def _add_date_bands(self):
        date = self.image.date()
        self.set('dayOfYear', date.getRelative('day', 'year'))

        self.set('daysFromTarget',
                 'abs(i.dayOfYear - {targetDay})',
                 {'targetDay': self.mosaic_def.target_day})
        self.setIfElse('daysFromTarget',
                   'i.daysFromTarget < i.daysFromTarget - 365',
                   'i.daysFromTarget - 365',
                   'daysFromTarget')

        millisPerDay = 1000 * 60 * 60 * 24
        self.set('unixTimeDays', date.millis().divide(millisPerDay))

    def _scale_image(self):
        multiplierByBand = {
            'blue': 10000, 'green': 10000, 'red': 10000, 'nir': 10000, 'swir1': 10000, 'swir2': 10000,
            'water': 1, 'snow': 1, 'cloud': 1,
            'shadowThreshold': 10000, 'shadowScore': 10000, 'hazeScore': 10000,
            'daysFromTarget': 1, 'dayOfYear': 1, 'unixTimeDays': 1
        }

        self.image = self.image \
            .select(multiplierByBand.keys()) \
            .multiply(multiplierByBand.values()) \
            .uint16()
