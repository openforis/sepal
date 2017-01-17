import ee

from util import *


def calculate(image):
    def rescale(img, exp, thresholds):
        return img.expression(exp, {'img': img})\
            .subtract(thresholds[0]).divide(thresholds[1] - thresholds[0])
    score = ee.Image(1.0)
    score = score.min(rescale(image, 'img.%s' % BLUE, [0.1, 0.3]))
    score = score.min(rescale(image, 'img.%s + img.%s + img.%s' % (RED, GREEN, BLUE), [0.2, 0.8]))
    score = score.min(
    rescale(image, 'img.%s + img.%s + img.%s' % (NIR, SWIR1, SWIR2), [0.3, 0.8]))
    score = score.min(rescale(image, 'img.%s' % THERMAL, [300, 290]))
    ndsi = image.normalizedDifference([GREEN, SWIR1])
    return score.min(rescale(ndsi, 'img', [0.8, 0.6])).rename(['quality'])
