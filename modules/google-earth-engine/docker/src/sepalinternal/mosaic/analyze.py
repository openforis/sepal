import ee

import brdf_correction
from cloud_score import cloud_score
from ..image_operation import ImageOperation, combine_probability


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
        # self.image = self.image.resample('bicubic')
        self._normalize_band_names()
        self.image = self.data_set.analyze(self.image)
        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')
        self.set('ndwi',
                 '(i.green - i.nir) / (i.green + i.nir)')

        # Based on https://earth.esa.int/c/document_library/get_file?folderId=349490&name=DLFE-4518.pdf
        self.set('snowProbability',
                 combine_probability([
                     self.rescale('i.ndsi', 0.2, 0.42),
                     self.rescale('i.nir', 0.15, 0.35),
                     self.rescale('i.blue', 0.18, 0.22),
                     self.rescale('i.blue/i.red', 0.85, 0.95)
                 ]))
        self.set('snow', 'i.snow or i.snowProbability > 0.12')
        if self.mosaic_def.mask_snow:
            self.setIf('toMask', '!i.toMask', 'i.snow')

        self.set('water', '!i.snow and (i.blue/i.swir1 > 4.0 or i.ndwi > 0.15)')

        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')
        self.set('shadowThreshold', 0.09)

        # Intermediate bands to use in hazeScore
        self.set('meanVis',
                 '(i.blue + i.green + i.red) / 3')
        self.set('whiteness',
                 '(abs(i.blue - i.meanVis) + abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')
        self.set('variabilityProbability',
                 '1 - max(max(abs(i.ndvi), abs(i.ndsi)), i.whiteness)')
        self.set('variabilityProbability',
                 'max(i.variabilityProbability, 0.1)')
        self.setIf('toMask', '!i.toMask', 'i.variabilityProbability < -0.5')  # Remove bad pixels

        self.set('cirrusCloudProbability',
                 'i.cirrus / 0.04')

        self.set('hazeProbability',
                 'min(50 * max(i.blue - 0.5 * i.red - 0.06, 0), 1)')

        self.set('aerosolProbability',
                 'max(100 * pow(i.aerosol - 0.15, 2), 0)')

        if self.mosaic_def.surface_reflectance:
            self.set('hazeScore', 1)
        else:
            self.set('hazeScore',
                     'max(1 - (i.hazeProbability + i.variabilityProbability + i.cirrusCloudProbability + i.aerosolProbability) / 10, 0)')

        self.set('soil', 'i.blue/i.swir1 < 0.55 or i.nir/i.swir1 < 0.90')
        self.set('cloudScore', cloud_score(self.image))
        self.setIf('cloudScore', 'soil', 0)
        if self.mosaic_def.mask_snow or self.mosaic_def.mask_clouds:
            self.set('cloud', 'i.cloud or i.cloudScore > 0.25 or (i.cloudScore > 0 and i.aerosol > 0.2) or i.hazeScore == 0')
        else:
            self.set('cloud', '!i.snow and (i.cloud or i.cloudScore > 0.25 or (i.cloudScore > 0 and i.aerosol > 0.2) or i.hazeScore == 0)')

        self._add_date_bands()

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
        multiplier_by_band = {
            'toMask': 1, 'water': 1, 'snow': 1, 'cloud': 1, 'ndvi': 10000,
            'shadowThreshold': 10000, 'shadowScore': 10000, 'hazeScore': 10000,
            'daysFromTarget': 1, 'dayOfYear': 1, 'unixTimeDays': 1
        }

        for band in self.data_set.bands():
            multiplier_by_band[band] = 10000

        self.image = ee.Image(
            self.image \
                .select(multiplier_by_band.keys()) \
                .multiply(multiplier_by_band.values()) \
                .copyProperties(self.image)
                .set('system:time_start', self.image.get('system:time_start'))
        ).uint16()
