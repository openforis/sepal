import ee

from ..image_operation import ImageOperation


class Normalizer(ImageOperation):
    def __init__(self, image):
        super(Normalizer, self).__init__(image)

    def apply(self, bands):
        normalizedBands = list(bands.keys())
        asterBands = list(bands.values())

        def to_radiance():
            def coefficient(asterBand):
                return ee.Image(ee.Number(self.image.get('GAIN_COEFFICIENT_' + asterBand))) \
                    .float() \
                    .rename([asterBand])

            coefficients = ee.Image.cat(
                [coefficient(asterBand) for asterBand in asterBands]
            ).select(asterBands, normalizedBands)
            radiance = self.image.subtract(1).multiply(coefficients)
            self.image = self.image.addBands(radiance, None, True)

        def to_thermal():
            self.set('thermal',
                     '{k2} / log({k1}/i.thermal + 1)',
                     {'k1': 3040.136402, 'k2': 1735.337945})

        def to_reflectance():
            self.set('dayOfYear',
                     self.image.date().getRelative('day', 'year'))

            self.set('earthSunDistance',
                     '1 - 0.01672 * cos(0.01720209895 * (i.dayOfYear - 4))')

            self.set('sunElevation',
                     ee.Number(self.image.get('SOLAR_ELEVATION')))

            self.set('sunZen',
                     '(90 - i.sunElevation) * {pi}/180')

            self.set('reflectanceFactor',
                     '{pi} * pow(i.earthSunDistance, 2) / cos(i.sunZen)')

            # Solar Spectral Irradiance
            irradiance = [1847, 1553, 1118, 232.5, 80.32]
            reflectance = self.image.select(['green', 'red', 'nir', 'swir1', 'swir2']) \
                .multiply(self.image.select('reflectanceFactor')).divide(irradiance)
            self.image = self.image \
                .addBands(reflectance, None, True)

        to_radiance()
        to_thermal()
        to_reflectance()
        self.image = self.image.select(normalizedBands)
        self.set('blue', 'green')  # Add dummy for missing blue
        return self.image
