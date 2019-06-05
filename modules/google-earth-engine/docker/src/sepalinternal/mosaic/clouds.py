import ee

from ..image_operation import ImageOperation


def mask_clouds(mosaic_def, collection):
    if not mosaic_def.mask_clouds:
        reduced = collection.select('cloud') \
            .reduce(ee.Reducer.sum()
                    .combine(ee.Reducer.count(), "", True)
                    .combine(ee.Reducer.min(), "", True))
        # Proportion of pixels that are cloudy
        cloud_proportion = reduced.select('cloud_sum') \
            .divide(reduced.select('cloud_count'))
        # A representative proportion of pixels that are cloudy cloudy for the neighborhood
        normal_cloud_proportion = cloud_proportion.reproject(crs='EPSG:4326', scale=10000) \
            .max(cloud_proportion.reproject(crs='EPSG:4326', scale=20000))
        # Measure of how a locations cloud proportion differs from the general area
        cloud_proportion_diff = cloud_proportion.subtract(normal_cloud_proportion)
        only_clouds = reduced.select('cloud_min')

        # When there is higher proportion of clouds than the normaly, keep the clouds.
        # It's probably something (typically buildings) misclassified as clouds.
        # Also, don't trust the cloud classification enough to completely mask area with only clouds
        # Desert sand can be classified as cloud.
        keep_clouds = cloud_proportion_diff.gt(0.4).And(normal_cloud_proportion.lt(0.3))
        keep_clouds = keep_clouds.Or(only_clouds)
    else:
        keep_clouds = False

    return collection.map(lambda image: _MaskClouds(image, mosaic_def).apply(keep_clouds))


class _MaskClouds(ImageOperation):
    def __init__(self, image, mosaic_def):
        super(_MaskClouds, self).__init__(image)
        self.mosaic_def = mosaic_def

    def apply(self, keep_clouds):
        cloud_free = buffer_mask(self.toImage('!i.cloud'), 300)
        # cloud_free = self.toImage('!i.cloud')
        to_mask = self.image.select('toMask')
        if keep_clouds:
            mask = to_mask.Not().And(cloud_free.Or(keep_clouds))
        else:
            mask = to_mask.Not().And(cloud_free)
        return self.image.updateMask(mask)


def buffer_mask(mask, meters):
    inner_pixels = mask \
        .fastDistanceTransform(256, 'pixels').sqrt() \
        .multiply(ee.Image.pixelArea().sqrt()) \
        .gt(mask.projection().nominalScale().multiply(5)).And(mask.Not())

    distance_to_inner_pixels = inner_pixels \
        .fastDistanceTransform(256, 'pixels').sqrt() \
        .multiply(ee.Image.pixelArea().sqrt())

    # Mask with tiny patches of 0s removed
    filtered_mask = distance_to_inner_pixels \
        .lt(100).And(mask.Not()).Not()

    pixels = ee.Number(256).min(ee.Number(meters).multiply(2))
    distance = filtered_mask.Not() \
        .fastDistanceTransform(pixels, 'pixels').sqrt() \
        .multiply(ee.Image.pixelArea().sqrt())
    return distance.gt(meters)

