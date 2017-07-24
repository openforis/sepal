import ee
from math import pi

from ..image_operation import ImageOperation


class FirstPass(ImageOperation):
    def __init__(self, image, collection_def):
        super(FirstPass, self).__init__(image)
        self.collection_def = collection_def

    def apply(self):
        # Replace bands in source image, to ensure all image properties are preserved
        self.image = self.image.addBands(  # Overwrite bands to prevent loss of image properties
            self.image.divide(10000), None, True
        )

        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')

        self.set('cloudProbability', 1)

        # https://earth.esa.int/c/document_library/get_file?folderId=349490&name=DLFE-4518.pdf
        self.cloudProbability('i.red', 0.07, 0.25)
        self.cloudProbability('i.ndsi', -0.28, -0.16)  # -0.24, 0.16 in paper, -0.24, -0.16 in GitHub

        self.setIfElse('snowProbability', 'i.cloudProbability > 0', 1, 0)
        self.snowProbability('i.ndsi', 0.2, 0.42)
        self.snowProbability('i.nir', 0.15, 0.35)
        self.snowProbability('i.blue', 0.18, 0.22)
        self.snowProbability('i.blue/i.red', 0.85, 0.95)
        self.set('snow', 'i.snowProbability > 0.12')
        self.setIf('cloudProbability', 'snow', 0)

        self.cloudProbabilityInverse('i.ndvi', 0.36, 0.80)  # 0.36, 0.40 in paper, leading to omission
        self.cloudProbabilityInverse('i.nir/i.green', 1.50, 3.00)  # 1.50, 2.50 in paper, leading to omission
        self.set('vegetation', 'i.nir/i.green > 2.5')
        self.cloudProbability('i.blue/i.swir1', 0.55, 0.80)
        self.cloudProbabilityInverse('i.blue/i.swir1', 2.0, 4.0)
        self.set('water', 'i.blue/i.swir1 > 4.0')
        self.cloudProbability('i.nir/i.swir1', 0.70, 0.90)
        self.cloudProbability('i.waterVapor', 0.03, 0.06)  # Clouds have high water vapor

        self.setIf('cloudProbability',
                   'i.waterVapor > 0.1 and i.aerosol > 0.15',
                   1)

        self.setIf('cirrus',
                   self.isMasked('cirrus'), 0)
        self.set('cloud',
                 'i.cirrus > 0.012 or i.cloudProbability > 0.35')

        self.set('meanVis',
                 '(i.blue + i.green + i.red) / 3')
        self.set('whiteness',
                 '(abs(i.blue - i.meanVis) + abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')
        self.set('variabilityProbability',
                 '1 - max(max(abs(i.ndvi), abs(i.ndsi)), i.whiteness)')
        self.set('noiseTest',
                 'i.variabilityProbability < -0.5')
        self.set('variabilityProbability',
                 'max(i.variabilityProbability, 0.1)')

        self.set('cirrusCloudProbability',
                 'i.cirrus / 0.04')

        self.set('hazeProbability',
                 'min(50 * max(i.blue - 0.5 * i.red - 0.06, 0), 1)')

        self.set('aerosolProbability',
                 'max(50 * (i.aerosol - 0.15), 0)')

        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')

        self.set('shadowProbability',
                 '1 - min(i.shadowScore, 0.14) / 0.14')

        self.setIfElse('landScore',
                       '!i.water',
                       'max(1 - (i.aerosolProbability + i.variabilityProbability / 3 + i.cirrusCloudProbability + i.cloudProbability + i.hazeProbability + i.shadowProbability) / 10, 0)',
                       0)

        self.setIfElse('waterScore',
                       'i.water',
                       'max(1 - (i.aerosolProbability + i.cirrusCloudProbability + i.hazeProbability + i.shadowProbability) / 10, 0)',
                       0)

        self.set('shadowFree',
                 'i.shadowScore > 0.14')

        self.setIfElse('shadowFreeScore',
                       'shadowFree',
                       'landScore',
                       0)

        self.cloudShadow()

        self.updateMask('!i.noiseTest')
        self.updateMask('!i.cloudShadow')

        return self.image

    def cloudProbability(self, value, lower, upper):
        self.probability('cloudProbability', value, lower, upper)

    def cloudProbabilityInverse(self, value, lower, upper):
        self.probabilityInverse('cloudProbability', value, lower, upper)

    def snowProbability(self, value, lower, upper):
        self.probability('snowProbability', value, lower, upper)

    def probability(self, name, value, lower, upper):
        args = {'name': name, 'value': value, 'lower': lower, 'upper': upper}
        self.setIf(name,
                   '{value} < {lower}', 0, args)

        self.setIf(name,
                   '{lower} <= {value} and {value} <= {upper}',
                   'i.{name} * ({value} - {lower}) / ({upper} - {lower})', args)

    def probabilityInverse(self, name, value, lower, upper):
        args = {'name': name, 'value': value, 'lower': lower, 'upper': upper}
        self.setIf(name,
                   '{value} > {upper}', 0, args)

        self.setIf(name,
                   '{lower} <= {value} and {value} <= {upper}',
                   'i.{name} * ({upper} - {value}) / ({upper} - {lower})', args)

    def cloudShadow(self):
        cloud = self.image.select('red').multiply(0) \
            .add(self.toImage('cloud'))  # Force same CRS as image

        # Author: Gennadii Donchyts
        # License: Apache 2.0

        # solar geometry (radians)
        azimuth = ee.Number(self.image.get('MEAN_SOLAR_AZIMUTH_ANGLE')).multiply(pi).divide(180.0).add(
            ee.Number(0.5).multiply(pi))
        zenith = ee.Number(0.5).multiply(pi).subtract(
            ee.Number(self.image.get('MEAN_SOLAR_ZENITH_ANGLE')).multiply(pi).divide(180.0))
        # find where cloud shadows should be based on solar geometry
        nominalScale = cloud.projection().nominalScale()
        cloudHeights = ee.List.sequence(200, 10000, 500)

        def calculateShadow(cloudHeight):
            cloudHeight = ee.Number(cloudHeight)
            shadowVector = zenith.tan().multiply(cloudHeight)
            x = azimuth.cos().multiply(shadowVector).divide(nominalScale).round()
            y = azimuth.sin().multiply(shadowVector).divide(nominalScale).round()
            return cloud.changeProj(cloud.projection(), cloud.projection().translate(x, y))

        self.set('cloudShadow', ee.ImageCollection.fromImages(cloudHeights.map(calculateShadow)).max())
        self.set('cloudShadow', 'i.cloudShadow and !i.cloud and i.shadowScore < 0.14 and !i.vegetation')
