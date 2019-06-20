from random import random

import ee
from sepal.ee.image import evaluate_pairwise, select_existing
from sepal.ee.optical import optical_indexes
from sepal.ee.terrain import create_terrain_image
from sepal.ee.water import create_surface_water_image

from ..gee import get_info
from ..image_spec import ImageSpec
from ..sepal_exception import SepalException


class Classification(ImageSpec):
    def __init__(self, sepal_api, spec, create_image_spec):
        super(Classification, self).__init__()
        self.pyramiding_policy = '{"class": "mode"}'
        self.spec = spec
        model = spec['recipe']['model']
        self.trainingData = ee.FeatureCollection('ft:' + model['trainingData']['fusionTable'])
        self.classProperty = model['trainingData']['fusionTableColumn']

        def to_image_spec(image):
            image_spec = create_image_spec(sepal_api, {'recipe': image})
            image_spec.band_set_specs = image['bandSetSpecs']
            return image_spec

        self.images = [to_image_spec(image) for image in model['inputImagery']['images']]
        self.auxiliary_imagery = model.get('auxiliaryImagery', [])
        self.aoi = self.images[0].aoi

        self.scale = spec.get('scale') if spec.get('scale') else min([image.scale for image in self.images])
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

        image = ee.Image([self._with_covariates(image) for image in self.images])
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
            .uint8() \
            .clip(self.aoi.geometry())

    def _with_covariates(self, image):
        original_ee_image = image._ee_image()
        ee_image = original_ee_image
        for band_set_spec in image.band_set_specs:
            type = band_set_spec['type']
            included = band_set_spec.get('included')
            operation = band_set_spec.get('operation')
            if type == 'IMAGE_BANDS':
                ee_image = select_existing(ee_image, included)
            elif type == 'PAIR_WISE_EXPRESSION' and operation == 'RATIO':
                ee_image = ee_image.addBands(_ratio(ee_image, included))
            elif type == 'PAIR_WISE_EXPRESSION' and operation == 'NORMALIZED_DIFFERENCE':
                ee_image = ee_image.addBands(_normalized_difference(ee_image, included))
            elif type == 'PAIR_WISE_EXPRESSION' and operation == 'DIFFERENCE':
                ee_image = ee_image.addBands(_diff(ee_image, included))
            elif type == 'PAIR_WISE_EXPRESSION' and operation == 'DISTANCE':
                ee_image = ee_image.addBands(_distance(ee_image, included))
            elif type == 'PAIR_WISE_EXPRESSION' and operation == 'ANGLE':
                ee_image = ee_image.addBands(_angle(ee_image, included))
            elif type == 'INDEXES':
                ee_image = _with_indexes(ee_image, original_ee_image, included)

        has_data = ee_image.mask().reduce(ee.Reducer.max())
        if 'LATITUDE' in self.auxiliary_imagery:
            ee_image = ee_image.addBands(ee.Image.pixelLonLat().select('latitude').float().mask(has_data))
        if 'TERRAIN' in self.auxiliary_imagery:
            ee_image = ee_image.addBands(create_terrain_image().mask(has_data))
        if 'WATER' in self.auxiliary_imagery:
            ee_image = ee_image.addBands(create_surface_water_image().mask(has_data))
        return ee_image


def _force_cache_flush(feature):
    return feature \
        .set('__flush_cache__', random()) \
        .copyProperties(feature)


def _normalized_difference(image, bands):
    return evaluate_pairwise(image, bands, '(b1 - b2) / (b1 + b2)', 'nd_${b1}_${b2}')


def _ratio(image, bands):
    return evaluate_pairwise(image, bands, 'b1 / b2', 'ratio_${b1}_${b2}')


def _diff(image, bands):
    return evaluate_pairwise(image, bands, 'b1 - b2', 'diff_${b1}_${b2}')


def _angle(image, bands):
    return evaluate_pairwise(image, bands, 'atan2(b1, b2) / pi', 'angle_${b1}_${b2}')


def _distance(image, bands):
    return evaluate_pairwise(image, bands, 'hypot(b1, b2)', 'distance_${b1}_${b2}')


def _with_indexes(image, original_image, indexes):
    for index_name in indexes:
        image = image.addBands(optical_indexes.to_index(original_image, index_name))
    return image


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
