import ee

from util import *


def apply(image_collection, mosaic_def):
    result = image_collection.map(lambda image: _adjust_image(image, mosaic_def))
    return result


def _adjust_image(image, mosaic_def):
    """Masks clouds, adjusts some bands and adds some new bands.

        * quality - quality based on temperature, wetness, days from target day of year, and cloud cover
        * date - days since epoch
        * days - days from target day of year
        * temp - temperature

    :param image: The image to adjust.
        All collections must have normalized band names.
    :type image: ee.Image

    :param mosaic_def: Mosaic parameters
    :type mosaic_def: LandsatMosaic

    :return: The adjusted ee.Image.
    """
    return image
    # image = _apply_mask(image)
    # quality_band = _quality_band(image)
    #
    # return image \
    #     .addBands(quality_band)


def _apply_mask(image):
    """Use FMask attribute to mask provided classes.

    :param image: The image to mask
    :type image: ee.Image
    """
    # Blue greater than 1400 indicate dense and soft clouds
    mask = ee.Image(0).where(image.select('B2').gt(1400), 1).Not()
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

    image = image.select([BLUE, GREEN, RED, NIR, SWIR1, SWIR2], ['blue', 'green', 'red', 'nir', 'swir1', 'swir2'])
    ndsi = image.normalizedDifference(['green', 'swir1'])
    score = ee.Image(1.0)
    score = score.min(rescale(image, 'img.blue', [0.1, 0.3]))
    score = score.min(rescale(image, 'img.red + img.green + img.blue', [0.2, 0.8]))
    score = score.min(rescale(image, 'img.nir + img.swir1 + img.swir2', [0.3, 0.8]))
    score = score.min(rescale(ndsi, 'img', [0.8, 0.6]))
    return score.rename([QUALITY])
