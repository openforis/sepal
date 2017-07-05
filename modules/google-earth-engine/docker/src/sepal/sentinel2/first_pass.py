from ..image_operation import ImageOperation


class FirstPass(ImageOperation):
    def __init__(self, image, collection_def):
        super(FirstPass, self).__init__(image)
        self.collection_def = collection_def

    def apply(self):
        qa60 = self.image.select('QA60')
        self.updateMask(
            qa60.bitwiseAnd(0x400).eq(0).And(  # no clouds
                qa60.bitwiseAnd(0x800).eq(0))  # no cirrus
        )
        self.image = self.image.addBands(
            self.image.select(self.collection_def.bands.keys()).divide(10000),
            None, True)

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

        self.set('ndwi',
                 '(i.green - i.nir) / (i.green + i.nir)')
        self.set('mndwi',
                 '(i.blue - i.nir)/(i.blue + i.nir)')
        self.set('water',
                 'i.ndwi + i.mndwi > 0')

        self.set('cirrusCloudProbability',
                 'i.cirrus / 0.04')

        self.set('noiseTest',
                 'i.variabilityProbability < 0 or i.meanVis > 0.4')
        self.updateMask('!i.noiseTest')

        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')

        self.set('shadowProbability',
                 '1 - min(i.shadowScore, 0.14) / 0.14')

        self.set('brightnessProbability',
                 'min(i.swir1, 0.11) / 0.11')

        self.set('waterCloudProbability',
                 'max((i.brightnessProbability + i.cirrusCloudProbability * 5 + i.hazeProbability) - 0.4, 0)')

        self.setIf('waterCloudScore',
                   'i.water',
                   'max(1 - i.waterCloudProbability, 0)',
                   0)

        self.updateMask('!i.water or i.waterCloudScore > 0.5')

        self.setIf('waterCloudScore',
                   'i.water',
                   'waterCloudScore',
                   0)

        self.set('landCloudProbability',
                 'max((i.variabilityProbability + i.cirrusCloudProbability + i.aerosol + i.hazeProbability * 10 + i.shadowProbability * 2) / 10, 0)')
        self.updateMask('i.aerosol < 0.2')

        self.set('landCloudScore',
                 'max(1 - i.landCloudProbability, 0)')
        self.setIf('landCloudScore',
                   'i.water',
                   0,
                   'landCloudScore')

        # Eq. 20 [2012]
        self.set('snow',
                 '!i.water and i.ndsi > 0.15 and i.nir > 0.11 and i.green > 0.1')

        return self.image
