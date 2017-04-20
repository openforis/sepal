from util import *


def apply(image_collection, mosaic_def):
    scored = image_collection.map(lambda image: image.addBands(_Score(image, mosaic_def).apply()))
    scoreMax = scored.select('score').reduce(ee.Reducer.max())
    scoreThreshold = scoreMax.multiply(0.99)

    def mask_clouds(image):
        score = image.select('score')
        return image.updateMask(score.gte(scoreThreshold))

    clouds_masked = scored.map(mask_clouds)
    maxShadowScore = clouds_masked.select('shadowScore').reduce(ee.Reducer.max())
    shadowScoreThreshold = maxShadowScore.multiply(0.99)

    def mask_shadows(image):
        shadowScore = image.select('shadowScore')
        return image.updateMask(shadowScore.gte(shadowScoreThreshold))

    result = clouds_masked.map(mask_shadows)
    return result


class _Score():
    def __init__(self, input, mosaic_def):
        self.image = input.divide(10000)

    def apply(self):
        self.normalizeBandNames()
        self.potentialCloudFirstPass()
        self.potentialCloudSecondPass()
        # potentialCloudShadow()
        self.score()

        return self.image.select('score').multiply(-1000).add(10000).uint16().rename(['score']) \
            .addBands(self.image.select('shadowScore').multiply(5000).uint16())

    def potentialCloudFirstPass(self):
        # Eq. 1 [2012]
        self.band('ndsi',
                  '(i.green - i.swir1) / (i.green + i.swir1)')
        self.band('ndvi',
                  '(i.nir - i.red) / (i.nir + i.red)')
        self.band('basicTest',
                  'i.swir2 > 0.03 and i.ndsi < 0.8 and i.ndvi < 0.8')

        # Eq. 2 [2012]
        self.band('meanVis',
                  '(i.blue + i.green + i.red) / 3')
        self.band('whiteness',
                  '(abs(i.blue - i.meanVis) + abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')
        self.band('whitenessTest',
                  'i.whiteness < 0.7')

        # Eq. 3 [2012]
        self.band('hazeTest',
                  '(i.blue - 0.5 * i.red - 0.08) > 0')

        # Eq. 4 [2012]
        self.band('b45test',
                  '(i.nir / i.swir1) > 0.75')

        # Eq. 5 [2012]
        self.band('waterTest',
                  '(i.ndvi < 0.01 and i.nir < 0.11) or (i.ndvi < 0.1 and i.nir < 0.05)')

        # Sec. 2.2.1 [2012]
        self.band('cirrusBandTest',
                  'i.cirrus > 0.01')

        # Eq. 6 [2012]
        self.band('pcp',  # Potential Cloud Pixels
                  # band('foo', # Potential Cloud Pixels
                  '(i.basicTest and i.whitenessTest and i.hazeTest and i.b45test) or i.cirrusBandTest')

    def potentialCloudSecondPass(self):
        # Eq. 1 [2015]
        self.band('cirrusCloudProbability',
                  'i.cirrus / 0.04')

        # Eq. 10 [2012]
        self.band('brightnessProbability',
                  'min(i.swir1, 0.11) / 0.11')

        # Eq. 2 [2015]
        self.band('waterCloudProbability',
                  'i.brightnessProbability + i.cirrusCloudProbability')

        # Eq. 7 [2012]
        self.band('clearSkyWater',
                  'i.waterTest and i.swir2 < 0.03')

        # Eq. 12 [2012]
        self.band('clearSkyLand',
                  '!i.pcp and !i.waterTest')

        # Eq. 15 [2012]
        self.band('modNdvi',
                  'i.ndvi')  # TODO: Set to 0 if green is saturated
        self.band('modNdsi',
                  'i.ndsi')  # TODO: Set to 0 if red is saturated
        self.band('variabilityProbability',
                  '1 - max(max(abs(i.modNdvi), abs(i.modNdsi)), i.whiteness)')

        # Eq. 3 [2015]
        self.band('landCloudProbability',
                  'i.variabilityProbability + i.cirrusCloudProbability')

    def potentialSnow(self):
        # Eq. 20 [2012]
        self.band('potentialSnow',
                  '!i.ndsi > 0.15 and i.nir > 0.11 and i.green > 0.1')

    def score(self):
        self.band('waterCloudScore',
                  self.zero('i.waterCloudProbability', '!i.pcp or !i.waterTest'))
        self.band('landCloudScore',
                  self.zero('i.landCloudProbability', '!i.pcp or i.waterTest'))
        self.band('cloudShadowScore',
                  self.zero('(2 - (i.nir + i.swir1)) / 10', 'i.pcp or i.waterTest'))
        self.band('score', 'i.waterCloudScore + i.landCloudScore')
        self.band('shadowScore', 'i.ndvi + 1')

    def normalizeBandNames(self):
        self.image = self.image.select(
            ['B2', 'B3', 'B4', 'B8A', 'B11', 'B12', 'B10'],
            ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'cirrus'])

    def band(self, name, toAdd):
        toAdd = self.toImage(toAdd)
        self.image = self.image.addBands(toAdd.rename([name]))

    def percentile(self, percentile, band):
        return ee.Image(self.percentileValue(percentile, band))

    def percentileValue(self, percentile, band):
        band = self.toImage(band)
        return ee.Number(
            band.reduceRegion(
                reducer=ee.Reducer.percentile([percentile]),
                scale=100
            ).values().get(0)
        )

    def zero(self, inputBand, test):
        inputBand = self.toImage(inputBand)
        test = self.toImage(test)
        return inputBand.where(test, 0)

    def toImage(self, band):
        if (isinstance(band, basestring)):
            if ('.' in band):
                band = self.image.expression(band, {'i': self.image})
            else:
                band = self.image.select(band)
        return band
