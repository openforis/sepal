from random import random

import ee

from ..image_operation import ImageOperation
from ..image_spec import ImageSpec


class Classification(ImageSpec):
    def __init__(self, spec, create_image_spec):
        super(Classification, self).__init__()
        self.spec = spec
        self.trainingData = ee.FeatureCollection('ft:' + spec['tableName'])
        self.classProperty = spec['classProperty']
        self.imageToClassify = create_image_spec(spec['imageToClassify'])
        self.aoi = self.imageToClassify.aoi
        self.scale = self.imageToClassify.scale
        self.bands = ['class']

    def _viz_params(self):
        classCount = int(ee.Number(self.trainingData.reduceColumns(
            reducer=ee.Reducer.max(),
            selectors=[self.classProperty]
        ).get('max')).getInfo()) + 1
        return {'bands': 'class', 'min': 0, 'max': (classCount - 1), 'palette': ', '.join(_colors[0:classCount])}
        # return {'bands': 'uncertainty', 'min': 0, 'max': 1, 'palette': 'green, yellow, orange, red'}

    def _ee_image(self):
        return _Operation(self.imageToClassify, self.trainingData, self.classProperty).apply()


class _Operation(ImageOperation):
    def __init__(self, imageToClassify, trainingData, classProperty):
        super(_Operation, self).__init__(imageToClassify._ee_image())
        self.trainingData = trainingData
        self.classProperty = classProperty
        self.scale = imageToClassify.scale

    def apply(self):
        bands = ee.List(['red', 'nir', 'swir1', 'swir2'])
        missingBands = bands.removeAll(self.image.bandNames())
        bands = bands.removeAll(missingBands)
        self.image = self.image.select(bands)

        def ratios_for_band(band):
            def ratio_for_band(band2):
                band2 = ee.String(band2)
                ratioName = band.cat('/').cat(ee.String(band2))
                ratio = self.image.select(band).divide(self.image.select(band2))
                return ratio.rename([ratioName])

            band = ee.String(band)
            return bands.slice(bands.indexOf(band).add(1)).map(ratio_for_band)

        def add_ratio(ratio, image):
            return ee.Image(image).addBands(ee.Image(ratio))

        ratios = bands.slice(0, -1).map(ratios_for_band).flatten()
        self.image = ee.Image(ratios.iterate(add_ratio, self.image))

        # Force updates to fusion table to be reflected
        self.trainingData = self.trainingData.map(self._force_cache_flush)
        training = self.image.sampleRegions(
            collection=self.trainingData,
            properties=[self.classProperty],
            scale=1
        )
        classifier = ee.Classifier.cart().train(training, self.classProperty)
        classification = self.image.classify(classifier.setOutputMode('CLASSIFICATION')).rename(['class'])
        # regression = self.image.classify(classifier.setOutputMode('REGRESSION')).rename(['regression'])
        # uncertainty = regression.subtract(classification).abs().rename(['uncertainty'])

        return classification \
            .uint8() \
            # .addBands(uncertainty)

    def _force_cache_flush(self, feature):
        return feature \
            .set('__flush_cache__', random()) \
            .copyProperties(feature)


_colors = [
    'FFB300',  # Vivid Yellow
    '803E75',  # Strong Purple
    'FF6800',  # Vivid Orange
    'A6BDD7',  # Very Light Blue
    'C10020',  # Vivid Red
    'CEA262',  # Grayish Yellow
    '817066',  # Medium Gray
    '007D34',  # Vivid Green
    'F6768E',  # Strong Purplish Pink
    '00538A',  # Strong Blue
    'FF7A5C',  # Strong Yellowish Pink
    '53377A',  # Strong Violet
    'FF8E00',  # Vivid Orange Yellow
    'B32851',  # Strong Purplish Red
    'F4C800',  # Vivid Greenish Yellow
    '7F180D',  # Strong Reddish Brown
    '93AA00',  # Vivid Yellowish Green
    '593315',  # Deep Yellowish Brown
    'F13A13',  # Vivid Reddish Orange
    '232C16',  # Dark Olive Green
]
