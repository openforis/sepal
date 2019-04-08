import math

import ee
from . import _speckle_filter

def create(
        start_date,
        end_date,
        region,
        ascending=True,
        decending=False,
):
    ksize = 3
    enl = 7
    harmonics = 1

    def to_gamma0(image):
        gamma0 = image.expression('i - 10 * log10(cos(angle * pi / 180))', {
            'i': image.select(['VV', 'VH']),
            'angle': image.select('angle'),
            'pi': math.pi
        })
        return image.addBands(gamma0, None, True)

    def mask_low_entropy(image):
#         bad = image.select(0).multiply(10000).toInt().entropy(ee.Kernel.circle(5)).lt(3.2)
#         return image.updateMask(image.mask().multiply(bad.focal_max(5).Not()))

        angle = image.select('angle')
        return image.updateMask(
            angle.gt(31).And(angle.lt(45))
        )

    #         return image

    def pre_process(image):
#         filtered_image = _speckle_filter.apply(image, ['VV', 'VH'], ksize, enl)
        filtered_image = image
        return to_gamma0(
            mask_low_entropy(
                filtered_image
            )
        ).select(['VV', 'VH'])

    return ee.ImageCollection('COPERNICUS/S1_GRD') \
        .filterBounds(region) \
        .filterDate(start_date, end_date) \
        .filter(ee.Filter.And(
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'),
            ee.Filter.listContains('transmitterReceiverPolarisation', 'VH')
        )).map(pre_process)
        
