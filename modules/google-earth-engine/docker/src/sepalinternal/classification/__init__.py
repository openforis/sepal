from random import random

import ee

from ..gee import get_info
from ..image_spec import ImageSpec
from ..sepal_exception import SepalException
from sepal.ee.image import combine
from sepal.ee.optical import optical_indexes
from sepal.ee.water import create_surface_water_image
from sepal.ee.terrain import create_terrain_image


class Classification(ImageSpec):
    def __init__(self, sepal_api, spec, create_image_spec):
        super(Classification, self).__init__()
        self.spec = spec
        model = spec['recipe']['model']
        self.trainingData = ee.FeatureCollection('ft:' + model['trainingData']['fusionTable'])
        self.classProperty = model['trainingData']['fusionTableColumn']
        self.images = [create_image_spec(sepal_api, {'recipe': image}) for image in model['imagery']['images']]
        self.auxiliary_imagery = model['auxiliaryImagery']
        self.aoi = self.images[0].aoi
        self.scale = min([image.scale for image in self.images])
        self.bands = ['class']

    def _viz_params(self):
        class_count = int(get_info(ee.Number(self.trainingData.reduceColumns(
            reducer=ee.Reducer.max(),
            selectors=[self.classProperty]
        ).get('max')))) + 1
        return {'bands': 'class', 'min': 0, 'max': (class_count - 1), 'palette': ', '.join(_colors[0:class_count])}

    def _ee_image(self):
        has_data_in_aoi = get_info(self.trainingData.filterBounds(self.aoi._geometry).size()) > 0
        if not has_data_in_aoi:
            raise SepalException(code='gee.classification.error.noTrainingData', message='No training data in AOI.')

        image = ee.Image([self._add_covariates(image._ee_image()) for image in self.images])
        print(image.bandNames().getInfo())
        # Force updates to fusion table to be reflected
        self.trainingData = self.trainingData.map(_force_cache_flush)
        training = image.sampleRegions(
            collection=self.trainingData,
            properties=[self.classProperty],
            scale=self.scale
        )
        classifier = ee.Classifier.randomForest(25).train(training, self.classProperty)
        classification = image.classify(classifier.setOutputMode('CLASSIFICATION')).rename(['class'])
        return classification \
            .uint8()

    def _add_covariates(self, image):
        image = image \
            .addBands(_normalized_difference(image, ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])) \
            .addBands(_ratio(image, ['swir1', 'nir'])) \
            .addBands(_ratio(image, ['red', 'swir1'])) \
            .addBands(optical_indexes.to_evi(image)) \
            .addBands(optical_indexes.to_savi(image)) \
            .addBands(optical_indexes.to_ibi(image)) \
            .addBands(_angle(image, ['brightness', 'greenness', 'wetness'])) \
            .addBands(_distance(image, ['brightness', 'greenness', 'wetness'])) \
            .addBands(
            _diff(image, ['VV', 'VV_min', 'VV_mean', 'VV_med', 'VV_max', 'VH', 'VH_min', 'VH_mean', 'VH_med', 'VH_max'])) \
            .addBands(_normalized_difference(image, ['VV_CV', 'VH_CV'])) \
            .addBands(_normalized_difference(image, ['VV_stdDev', 'VH_stdDev']))
        if 'LATITUDE' in self.auxiliary_imagery:
            image = image.addBands(ee.Image.pixelLonLat().select('latitude').float().mask(image.select(0).mask()))
        if 'TERRAIN' in self.auxiliary_imagery:
            image = image.addBands(create_terrain_image().mask(image.select(0).mask()))
        if 'WATER' in self.auxiliary_imagery:
            image = image.addBands(create_surface_water_image().mask(image.select(0).mask()))
        return image


def _force_cache_flush(feature):
    return feature \
        .set('__flush_cache__', random()) \
        .copyProperties(feature)



def _normalized_difference(image, bands):
    return combine(image, bands, '(b1 - b2) / (b1 + b2)', 'nd_${b1}_${b2}')


def _ratio(image, bands):
    return combine(image, bands, 'b1 / b2', 'ratio_${b1}_${b2}')


def _diff(image, bands):
    return combine(image, bands, 'b1 - b2', 'diff_${b1}_${b2}')


def _angle(image, bands):
    return combine(image, bands, 'atan2(b1, b2) / pi', 'angle_${b1}_${b2}')


def _distance(image, bands):
    return combine(image, bands, 'hypot(b1, b2)', 'distance_${b1}_${b2}')


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
