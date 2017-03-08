import ee

from util import *


def apply(image_collection, mosaic_def):
    result = image_collection.map(lambda image: _adjust_image(image, mosaic_def))
    return result


def _adjust_image(image, mosaic_def):
    return _apply_mask(
        image.addBands(_quality_band(image))
    )


def _apply_mask(image):
    """
    :param image: The image to mask
    :type image: ee.Image
    """
    # cloud_threshold = 100
    # score = image.select([QUALITY])
    # score = score.lt(cloud_threshold)
    #
    qa = image.select('QA60')
    mask = qa.bitwiseAnd(0x400).eq(0).And(  # no clouds
        qa.bitwiseAnd(0x800).eq(0))  # no cirrus
    return image.updateMask(mask)


def _quality_band(image):
    """Add quality band based on Google's simple cloud score.

    :param image: The image to adjust.
        All collections must have normalized band names.
    :type image: ee.Image

    :return: The adjusted ee.Image.
    """

    def rescale(img, exp, thresholds):
        return img.expression(exp, {'img': img}).subtract(thresholds[0]).divide(thresholds[1] - thresholds[0])

    image = image.select(
        [AEROSOL, BLUE, GREEN, RED, NIR, SWIR1, CIRRUS],
        ['aerosol', 'blue', 'green', 'red', 'nir', 'swir1', 'cirrus'])
    score = ee.Image(1)
    # Clouds are reasonably bright in the blue and cirrus bands.
    score = score.min(rescale(image, 'img.blue', [0.1, 0.5]))
    score = score.min(rescale(image, 'img.aerosol', [0.1, 0.3]))
    score = score.min(rescale(image, 'img.aerosol + img.cirrus', [0.15, 0.2]))
    # Clouds are reasonably bright in all visible bands.
    score = score.min(rescale(image, 'img.red + img.green + img.blue', [0.2, 0.9]))
    # Clouds are moist
    ndmi = image.normalizedDifference(['nir', 'swir1'])
    score = score.min(rescale(ndmi, 'img', [-0.1, 0.1]))
    # However, clouds are not snow.
    ndsi = image.normalizedDifference(['green', 'swir1'])
    score = score.min(rescale(ndsi, 'img', [0.8, 0.6]))
    return ee.Image(score.multiply(100).byte().rename([QUALITY]))
