import ee

from ..image_operation import ImageOperation


class FirstPass(ImageOperation):
    def __init__(self, image, mosaic_def, collection_def):
        super(FirstPass, self).__init__(image)
        self.mosaic_def = mosaic_def
        self.collection_def = collection_def

    def apply(self):
        cirrus = 'cirrus' in self.collection_def.bands
        if 'fmask' in self.collection_def.bands:
            self.updateMask('i.fmask < 2')
        else:
            def is_not(types):
                # https://landsat.usgs.gov/collectionqualityband
                typeByValue = {'badPixels': 15, 'cloud': 16, 'shadow': 256, 'snow': 1024, 'cirrus': 4096}
                notSet = ee.Image(1)
                for pixel_type in types:
                    notSet = notSet.And(self.select('BQA').bitwiseAnd(typeByValue[pixel_type]).eq(0))
                return notSet

            typesToMask = ['badPixels', 'cloud', 'shadow', 'cirrus']
            if self.mosaic_def.mask_snow:
                typesToMask.append('snow')
            self.updateMask(is_not(typesToMask))

        self.set('BT', 'i.thermal - 273.15')

        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')
        self.set('ndmi',
                 '(i.nir - i.swir1) / (i.nir + i.swir1)')

        self.set('basicTest',
                 'i.swir2 > 0.03 and i.ndsi < 0.8 and i.ndvi < 0.8')

        self.set('hazeProbability',
                 'max(i.blue - 0.5 * i.red - 0.06, 0)')

        self.set('meanVis',
                 '(i.blue + i.green + i.red) / 3')
        self.set('whiteness',
                 '(abs(i.blue - i.meanVis) + abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')

        self.set('variabilityProbability',
                 '1 - max(max(abs(i.ndvi), abs(i.ndsi)), i.whiteness)')

        self.set('noiseTest',
                 'i.variabilityProbability < 0 or i.meanVis > 0.4')
        self.updateMask('!i.noiseTest')

        self.set('ndwi',
                 '(i.green - i.nir) / (i.green + i.nir)')
        self.set('mndwi',
                 '(i.blue - i.nir)/(i.blue + i.nir)')
        self.set('water',
                 'i.ndwi + i.mndwi > 0')

        if cirrus:
            self.set('cirrusCloudProbability',
                     'i.cirrus / 0.04')

        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')

        self.set('shadowProbability',
                 '1 - min(i.shadowScore, 0.14) / 0.14')

        self.set('brightnessProbability',
                 'min(i.swir1, 0.11) / 0.11')

        self.set('tWater', 20)
        self.set('waterTemperatureProbability',
                 '(i.tWater - i.BT) / 4')

        if cirrus:
            self.set('waterCloudProbability',
                     'max((i.brightnessProbability + i.waterTemperatureProbability + i.cirrusCloudProbability * 5 + i.hazeProbability) - 0.4, 0)')
        else:
            self.set('waterCloudProbability',
                     'max((i.brightnessProbability * i.waterTemperatureProbability + i.hazeProbability) - 0.4, 0)')

        self.setIf('waterCloudScore',
                   'water',
                   'max(1 - i.waterCloudProbability, 0)',
                   0)
        self.updateMask('!i.water or i.waterCloudScore > 0.5')
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

        if cirrus:
            self.set('landCloudProbability',
                     'max((i.variabilityProbability + i.landTemperatureProbability + i.cirrusCloudProbability + i.hazeProbability * 10 + i.shadowProbability * 2) / 10, 0)')
        else:
            self.set('landCloudProbability',
                     'max((i.variabilityProbability + i.landTemperatureProbability + i.hazeProbability * 10 + i.shadowProbability * 2) / 10, 0)')

        self.set('landCloudScore',
                 'max(1 - i.landCloudProbability, 0)')
        self.setIf('landCloudScore',
                   'water',
                   0,
                   'landCloudScore')

        # Eq. 20 [2012]
        self.set('snow',
                 '!i.water and i.ndsi > 0.15 and i.nir > 0.11 and i.green > 0.1 and i.BT < 9.85')

        return self.image
