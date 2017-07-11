import brdf_correction
from ..image_operation import ImageOperation


class FirstPass(ImageOperation):
    def __init__(self, image):
        super(FirstPass, self).__init__(image)

    def apply(self, mosaic_def, collection_def):
        bands = collection_def.bands
        self.image = self.image.select(list(bands.values()), list(bands.keys()))
        date = self.image.date()
        self.set('dayOfYear',
                 date.getRelative('day', 'year'))

        self.set('daysFromTarget',
                 'abs(i.dayOfYear - {targetDay})',
                 {'targetDay': (mosaic_def.target_day)})
        self.setIf('daysFromTarget',
                   'i.daysFromTarget < i.daysFromTarget - 365',
                   'i.daysFromTarget - 365',
                   'daysFromTarget')

        millisPerDay = 1000 * 60 * 60 * 24
        self.set('unixTimeDays',
                 date.millis().divide(millisPerDay))

        normalized = collection_def.first_pass(self.image, mosaic_def, collection_def)
        self.image = self.image.addBands(normalized, None, True)

        self.setIf('shadowScore',
                   '!i.water',
                   'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)',
                   1)

        self.set('shadowFree',
                 'i.shadowScore > 0.14')

        self.setIf('shadowFreeCloudScore',
                   'shadowFree',
                   'landCloudScore',
                   0)

        if mosaic_def.brdf_correct:
            self.image = brdf_correction.apply(self.image)

        if mosaic_def.mask_snow:
            self.updateMask(self.select('snow').Not())

        multiplierByBand = {
            'blue': 10000, 'green': 10000, 'red': 10000, 'nir': 10000, 'swir1': 10000, 'swir2': 10000,
            'water': 1, 'waterBlue': 10000, 'waterCloudScore': 10000, 'landCloudScore': 10000,
            'shadowScore': 10000, 'shadowFree': 1, 'shadowFreeCloudScore': 10000,
            'daysFromTarget': 1, 'dayOfYear': 1, 'unixTimeDays': 1
        }
        return self.image \
            .select(multiplierByBand.keys()) \
            .multiply(multiplierByBand.values()) \
            .uint16()
