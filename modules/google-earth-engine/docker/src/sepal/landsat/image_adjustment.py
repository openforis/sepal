import ee
from util import *

import brdf_correction
import constants


def apply(image_collection, mosaic_def):
    return image_collection.map(lambda image: _adjust_image(image, mosaic_def))


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
    image = _apply_fmask(image, mosaic_def.classes_to_mask)
    image = brdf_correction.apply(image)
    return image


def _apply_fmask(image, classes_to_mask):
    """Use FMask attribute to mask provided classes.

    :param image: The image to mask
    :type image: ee.Image
    """
    fmask = image.select(FMASK)
    mask = image.mask()
    for class_to_mask in classes_to_mask:
        fmask_value_to_mask = constants.fmask_value_by_class_name[class_to_mask]
        mask = mask.And(fmask.neq(fmask_value_to_mask))

    return image.updateMask(mask)
