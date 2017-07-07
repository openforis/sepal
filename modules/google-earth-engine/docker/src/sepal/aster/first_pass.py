import ee

from ..image_operation import ImageOperation


class FirstPass(ImageOperation):
    def __init__(self, image, mosaic_def, collection_def):
        super(FirstPass, self).__init__(image)
        self.mosaic_def = mosaic_def
        self.collection_def = collection_def

    def apply(self):
        self.radiance()
        self.thermal()
        self.reflectance()
        self.cloudScore()
        self.set('blue', 'green')  # Add dummy for missing blue
        return self.image

    def radiance(self):
        bands = self.collection_def.bands
        normalizedBands = bands.keys()
        asterBands = bands.values()
        coefficients = ee.Image.cat(
            [ee.Image(ee.Number(self.image.get('GAIN_COEFFICIENT_' + asterBand))).float().rename([asterBand]) for
             asterBand
             in
             asterBands]).select(asterBands, normalizedBands)

        radiance = self.image.select(normalizedBands).subtract(1).multiply(coefficients)
        self.image = self.image.addBands(radiance, None, True)

    def thermal(self):
        self.set('thermal',
                 '{k2} / log({k1}/i.thermal + 1)',
                 {'k1': 3040.136402, 'k2': 1735.337945})

    def reflectance(self):
        self.set('dayOfYear',
                 ee.Number(ee.Date(ee.Number(self.image.get('system:time_start')))
                           .getRelative('day', 'year')))

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
        self.image = self.image.addBands(reflectance, None, True)

    def cloudScore(self):
        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')
        self.set('ndwi',
                 '(i.green - i.nir) / (i.green + i.nir)')

        self.set('water',
                 'i.ndwi > 0.15')

        self.set('waterBlue',
                 self.image.select('green').updateMask(self.image.select('water')))

        self.set('meanVis',
                 '(i.green + i.red) / 2')
        self.set('whiteness',
                 '(abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')
        self.set('variabilityProbability',
                 '1 - max(max(abs(i.ndvi), abs(i.ndsi)), i.whiteness)')

        self.set('noiseTest',
                 'i.variabilityProbability < -0.5')
        self.updateMask('!i.noiseTest')

        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')

        self.set('shadowProbability',
                 '1 - min(i.shadowScore, 0.14) / 0.14')

        self.set('BT', 'i.thermal - 273.15')

        self.set('brightnessProbability',
                 'min(i.swir1, 0.11) / 0.11')

        self.set('tWater', 20)
        self.set('waterTemperatureProbability',
                 '(i.tWater - i.BT) / 4')

        self.set('waterCloudProbability',
                 'max((i.brightnessProbability + i.waterTemperatureProbability) - 0.4, 0)')

        self.setIf('waterCloudScore',
                   'water',
                   'max(1 - i.waterCloudProbability, 0)',
                   0)

        self.setIf('waterCloudScore',
                   'water',
                   'waterCloudScore',
                   0)

        self.set('tHigh',
                 27)  # Get tHigh from metadata?
        self.set('tLow',
                 'i.tHigh - 10')
        self.set('landTemperatureProbability',
                 'max((i.tHigh + 4 - i.BT) / (i.tHigh + 4 - (i.tLow - 4)), 0)')

        self.set('landCloudProbability',
                 'max((i.variabilityProbability + i.landTemperatureProbability + i.shadowProbability * 2) / 10, 0)')

        self.set('landCloudScore',
                 'max(1 - i.landCloudProbability, 0)')
        self.setIf('landCloudScore',
                   'water',
                   0,
                   'landCloudScore')

        self.set('snow',
                 '!i.water and i.ndsi > 0.15 and i.nir > 0.11 and i.green > 0.1 and i.BT < 9.85')
