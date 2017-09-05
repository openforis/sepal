import ee

from ..image_operation import ImageOperation


class Analyze(ImageOperation):
    def __init__(self, image, bands, mosaic_def):
        super(Analyze, self).__init__(image)
        self.bands = bands
        self.mosaic_def = mosaic_def

    def apply(self):
        bands = self.bands
        if not 'aerosol' in bands:
            self.set('aerosol', 0)
        if not 'cirrus' in bands:
            self.set('cirrus', 0)

        if 'fmask' in bands:
            self.updateMask('i.fmask < 2')
            self.set('snow', 'i.fmask == 3')
        else:
            def is_set(types):
                # https://landsat.usgs.gov/collectionqualityband
                typeByValue = {'badPixels': 15, 'cloud': 16, 'shadow': 256, 'snow': 1024, 'cirrus': 4096}
                any_set = ee.Image(0)
                for type in types:
                    any_set = any_set.Or(self.image.select('BQA').bitwiseAnd(typeByValue[type]).neq(0))
                return any_set

            self.updateMask(is_set(['badPixels', 'cloud', 'shadow', 'cirrus']).Not())
            self.set('snow', is_set(['snow']))

        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')
        self.set('ndwi',
                 '(i.green - i.nir) / (i.green + i.nir)')

        self.set('water', 'i.blue/i.swir1 > 4.0 or i.ndwi > 0.15')

        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')
        self.set('shadowThreshold', 0.09)

        self.set('meanVis',
                 '(i.blue + i.green + i.red) / 3')
        self.set('whiteness',
                 '(abs(i.blue - i.meanVis) + abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')
        self.set('variabilityProbability',
                 '1 - max(max(abs(i.ndvi), abs(i.ndsi)), i.whiteness)')
        self.set('variabilityProbability',
                 'max(i.variabilityProbability, 0.1)')

        self.set('cirrusCloudProbability',
                 'i.cirrus / 0.04')

        self.set('hazeProbability',
                 'min(50 * max(i.blue - 0.5 * i.red - 0.06, 0), 1)')

        self.set('aerosolProbability',
                 'max(pow(i.aerosol - 0.15, 2), 0)')

        self.set('hazeScore',
                 'max(1 - (i.hazeProbability + i.variabilityProbability + i.cirrusCloudProbability + i.aerosolProbability) / 10, 0)')

        # There are no clouds - they've already been masked out
        self.set('cloud', 0)

        return self.image
