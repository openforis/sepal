import ee

from ..image_operation import ImageOperation


class Analyze(ImageOperation):
    def __init__(self, image, bands):
        super(Analyze, self).__init__(image)
        self.bands = bands

    def execute(self):
        blue = 'blue' in self.bands
        thermal = 'thermal' in self.bands
        cirrus = 'cirrus' in self.bands

        if thermal:
            self.set('BT', self.kelvin_to_celcius('thermal'))

        # Eq. 1 [2012]
        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')
        self.set('ndmi',
                 '(i.nir - i.swir1) / (i.nir + i.swir1)')
        if thermal:
            self.set('basicTest',
                     'i.swir2 > 0.03 and i.BT < 27 and i.ndsi < 0.8 and i.ndvi < 0.8')
        else:
            self.set('basicTest',
                     'i.swir2 > 0.03 and i.ndsi < 0.8 and i.ndvi < 0.8')

        if blue:
            # Eq. 3 [2012]
            self.set('hazeTest',
                     '(i.blue - 0.5 * i.red - 0.08) > 0')

            # Eq. 2 [2012]
            self.set('meanVis',
                     '(i.blue + i.green + i.red) / 3')
            self.set('whiteness',
                     '(abs(i.blue - i.meanVis) + abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')
        else:
            # Eq. 3 [2012] without blue
            self.set('hazeTest',
                     'i.red - 0.08 > 0')

            # Eq. 2 [2012] without blue
            self.set('meanVis',
                     '(i.green + i.red) / 2')
            self.set('whiteness',
                     '(abs(i.green - i.meanVis) + abs(i.red - i.meanVis)) / i.meanVis')

        self.set('whitenessTest',
                 'i.whiteness < 0.7')

        # Eq. 4 [2012]
        self.set('b45test',
                 '(i.nir / i.swir1) > 0.75')

        # Eq. 20 [2012] and adjusted BT from [2015]
        if thermal:
            self.set('snowTest',
                     'i.ndsi > 0.15 and i.nir > 0.11 and i.green > 0.1 and i.BT < 9.85')
        else:
            self.set('snowTest',
                     'i.ndsi > 0.15 and i.nir > 0.11 and i.green > 0.1')

        # Eq. 5 [2012]
        self.setIf('waterTest',
                   '!i.snowTest',
                   '(i.ndvi < 0.01 and i.nir < 0.11) or (i.ndvi < 0.1 and i.nir < 0.05)',
                   0)

        if cirrus:
            # Sec. 2.2.1 [2012]
            self.set('cirrusBandTest',
                     'i.cirrus > 0.01')

            # Eq. 1 [2015]
            self.set('cirrusCloudProbability',
                     'i.cirrus / 0.04')
        else:
            # Sec. 2.2.1 [2012]
            self.set('cirrusBandTest', 0)

            # Eq. 1 [2015]
            self.set('cirrusCloudProbability',
                     0)

        # Eq. 15 [2012]
        self.setIf('modNdvi',
                   'i.green == 1', 0, 'i.ndvi')
        self.setIf('modNdsi',
                   'i.red == 1', 0, 'i.ndsi')
        self.set('variabilityProbability',
                 '1 - max(max(abs(i.modNdvi), abs(i.modNdsi)), i.whiteness)')

        self.set('noiseTest',  # A negative variability probability or bright in RGB is likely noise
                 'i.variabilityProbability < 0 or i.meanVis > 0.3')

        self.set('pcp',  # Potential Cloud Pixels. Tweaked to include noise
                 '(i.basicTest and i.whitenessTest and i.hazeTest and i.b45test) or i.cirrusBandTest or i.noiseTest')

        # Eq. 10 [2012]
        self.set('brightnessProbability',
                 'min(i.swir1, 0.11) / 0.11')

        # Eq. 7 [2012]
        self.set('clearSkyWater',
                 'i.waterTest and i.swir2 < 0.03')

        if thermal:
            # Omissions in pcp gives percentiles that includes cloud.
            # tWater = percentiles([83],
            #   toImage('BT').updateMask(self.toImage('clearSkyWater')))
            # tWater = ee.Feature(null, tWater).toDictionary()\
            #     .combine({BT: 27}, false)\
            #     .toImage()
            # self.set('tWater',
            #    tWater)
            self.set('tWater',
                     20)
            self.set('waterTemperatureProbability',
                     '(i.tWater - i.BT) / 4')
        else:
            self.set('waterTemperatureProbability', 0)

        if cirrus:
            # Eq. 2 [2015]
            self.set('waterCloudProbability',
                     'i.brightnessProbability + i.waterTemperatureProbability + i.cirrusCloudProbability')
        else:
            # Eq. 11 [2012]
            self.set('waterCloudProbability',
                     'i.brightnessProbability * i.waterTemperatureProbability')

        # Eq. 12 [2012]
        self.set('clearSkyLand',
                 '!i.pcp and !i.waterTest')

        if thermal:
            # Eq. 13 [2012]
            # Omissions in pcp gives percentiles that includes cloud.
            # landBTPercentiles = self.percentiles(
            #     [17, 83],
            #     self.toImage('BT').updateMask(toImage('clearSkyLand')))
            # # Specify fallback temperatures for mostly cloudy scenes
            # landBTPercentiles = ee.Feature(null, landBTPercentiles).toDictionary() \
            #     .combine({BT_p17: 20, BT_p83: 27}, false) \
            #     .toImage()
            # self.set('tHigh',
            #     landBTPercentiles.select('BT_p83'))
            # self.set('tLow',  # Not using tLow, since pcp omissions can lead to tLow being cloud temp
            #     landBTPercentiles.select('BT_p17'))

            self.set('tHigh',
                     27)  # Get tHigh from metadata?
            self.set('tLow',
                     'i.tHigh - 10')
            self.set('landTemperatureProbability',
                     'max((i.tHigh + 4 - i.BT) / (i.tHigh + 4 - (i.tLow - 4)), 0)')

        else:
            self.set('landTemperatureProbability', 1)

        if cirrus:
            # Eq. 3 [2015]
            self.set('landCloudProbability',
                     'i.variabilityProbability + i.landTemperatureProbability + i.cirrusCloudProbability')
        else:
            # Eq. 16 [2012]
            self.set('landCloudProbability',
                     'i.variabilityProbability * i.landTemperatureProbability')

        self.setIf('waterCloudScore',
                   'i.pcp and i.waterTest',
                   'i.waterCloudProbability',
                   0)
        self.setIf('landCloudScore',
                   'i.pcp and !i.waterTest',
                   'i.landCloudProbability',
                   0)

        self.setIf('cloudScore',
                   'i.noiseTest',
                   0,  # Score noise really bad
                   '(i.waterCloudScore + i.landCloudScore) * -0.1 + 1')

        # Use a brightness index. Low scores mean shadows, high scores might be cloudy
        self.set('shadowScore',
                 'sqrt((pow(i.green, 2) + pow(i.red, 2) + pow(i.nir, 2)) / 3)')

        self.set('shadowFree',
                 'i.shadowScore > 0.14')

        self.set('shadowFreeCloudScore',
                 'i.cloudScore * i.shadowFree')

        return self.image.select(self.input_band_names.cat([
            'cloudScore',
            'shadowScore',
            'shadowFree',
            'shadowFreeCloudScore',
            'clearSkyWater',
            'clearSkyLand',
            'snowTest'
        ]))

    def percentiles(self, percentiles, band):
        band = self.toImage(band)
        return band.reduceRegion({
            reducer: ee.Reducer.percentile(percentiles),
            scale: 100
        })

    def kelvin_to_celcius(self, kelvin):
        return self.toImage(kelvin).subtract(273.15)
