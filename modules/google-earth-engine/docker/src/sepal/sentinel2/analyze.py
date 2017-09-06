import ee

from ..image_operation import ImageOperation


class Analyze(ImageOperation):
    def __init__(self, image, bands):
        super(Analyze, self).__init__(image)
        self.bands = bands

    def apply(self):
        self._mask_if_any_band_is_masked()
        self.setAll(self.image.divide(10000))

        self.set('ndsi',
                 '(i.green - i.swir1) / (i.green + i.swir1)')
        self.set('ndvi',
                 '(i.nir - i.red) / (i.nir + i.red)')
        self.set('ndwi',
                 '(i.green - i.nir) / (i.green + i.nir)')

        # Based on https://earth.esa.int/c/document_library/get_file?folderId=349490&name=DLFE-4518.pdf
        self.set('snowProbability', 1)
        self._snow_probability('i.ndsi', 0.2, 0.42)
        self._snow_probability('i.nir', 0.15, 0.35)
        self._snow_probability('i.blue', 0.18, 0.22)
        self._snow_probability('i.blue/i.red', 0.85, 0.95)
        self.set('snow',
                 'i.snowProbability > 0.12')
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
        self.set('noiseTest',
                 'i.variabilityProbability < -0.5')
        self.set('variabilityProbability',
                 'max(i.variabilityProbability, 0.1)')

        self.set('cirrusCloudProbability',
                 'i.cirrus / 0.04')

        self.set('hazeProbability',
                 'min(50 * max(i.blue - 0.5 * i.red - 0.06, 0), 1)')

        self.set('aerosolProbability',
                 'max(100 * pow(i.aerosol - 0.15, 2), 0)')

        self.set('hazeScore',
                 'max(1 - (i.hazeProbability + i.variabilityProbability + i.cirrusCloudProbability + i.aerosolProbability) / 10, 0)')

        self._cloud()
        self.updateMask('i.variabilityProbability > -0.5')  # Remove bad pixels

        return self.image

    def _mask_if_any_band_is_masked(self):
        for band in list(self.bands.keys()):
            isMasked = self.toImage(band).mask().reduce('min').eq(0)
            self.updateMask(isMasked.Not())

    def _snow_probability(self, value, lower, upper):
        name = 'snowProbability'
        args = {'name': name, 'value': value, 'lower': lower, 'upper': upper}
        self.setIf(name,
                   '{value} < {lower}', 0, args)

        self.setIf(name,
                   '{lower} <= {value} and {value} <= {upper}',
                   'i.{name} * ({value} - {lower}) / ({upper} - {lower})', args)

        return self.image

    # Based on scripts by Ian Hausman, which in turn is based on script by Matt Hancher
    # https://groups.google.com/d/msg/google-earth-engine-developers/i63DS-Dg8Sg/_hgCBEYeBwAJ
    def _cloud(self):
        def rescale(image, exp, thresholds):
            return image.expression(exp, {'i': image}) \
                .subtract(thresholds[0]).divide(thresholds[1] - thresholds[0])

        # Compute several indicators of cloudyness and take the minimum of them.
        score = ee.Image(1)
        blueCirrusScore = ee.Image(0)

        # Clouds are reasonably bright in the blue or cirrus bands.
        # Use .max as a pseudo OR conditional
        blueCirrusScore = blueCirrusScore.max(rescale(self.image, 'i.blue', [0.1, 0.5]))
        blueCirrusScore = blueCirrusScore.max(rescale(self.image, 'i.aerosol', [0.1, 0.5]))
        blueCirrusScore = blueCirrusScore.max(rescale(self.image, 'i.cirrus', [0.1, 0.3]))
        score = score.min(blueCirrusScore)

        # Clouds are reasonably bright in all visible bands.
        score = score.min(rescale(self.image, 'i.red + i.green + i.blue', [0.2, 0.8]))

        # Clouds are reasonably bright in all infrared bands.
        score = score.min(
            rescale(self.image, 'i.nir + i.swir1 + i.swir2', [0.3, 0.8]))

        # However, clouds are not snow.
        ndsi = self.image.normalizedDifference(['green', 'swir1'])

        score = score.min(rescale(ndsi, 'i', [0.8, 0.6]))

        self.set('soil', 'i.blue/i.swir1 < 0.55 or i.nir/i.swir1 < 0.90')
        self.setIfElse('cloudScore', 'soil', 0, score)
        self.set('cloud', 'i.cloudScore > 0.25 or (i.cloudScore > 0 and i.aerosol > 0.2) or i.hazeScore == 0')
