import ee

from ..image_operation import ImageOperation


def mask_clouds(mosaic_def, collection):
    if not mosaic_def.mask_clouds:
        reduced = collection.select('cloud') \
            .reduce(ee.Reducer.sum()
                    .combine(ee.Reducer.count(), "", True)
                    .combine(ee.Reducer.min(), "", True))
        # Proportion of pixels that are cloudy
        cloudProportion = reduced.select('cloud_sum') \
            .divide(reduced.select('cloud_count'))
        # A representative proportion of pixels that are cloudy cloudy for the neighborhood
        normalCloudProportion = cloudProportion.reproject(crs='EPSG:4326', scale=10000) \
            .max(cloudProportion.reproject(crs='EPSG:4326', scale=20000))
        # Measure of how a locations cloud proportion differs from the general area
        cloudProportionDiff = cloudProportion.subtract(normalCloudProportion)
        onlyClouds = reduced.select('cloud_min')

        # When there is higher proportion of clouds than the normaly, keep the clouds.
        # It's probably something (typically buildings) misclassified as clouds.
        # Also, don't trust the cloud classification enough to completely mask area with only clouds
        # Desert sand can be classified as cloud.
        keepClouds = cloudProportionDiff.gt(0.4).And(normalCloudProportion.lt(0.3))
        keepClouds = keepClouds.Or(onlyClouds)
    else:
        keepClouds = False

    return collection.map(lambda image: _MaskClouds(image, mosaic_def).apply(keepClouds))


class _MaskClouds(ImageOperation):
    def __init__(self, image, mosaic_def):
        super(_MaskClouds, self).__init__(image)
        self.mosaic_def = mosaic_def

    def apply(self, keepClouds):
        cloud_free = self.toImage('!i.cloud')
        to_mask = self.image.select('toMask')
        if keepClouds:
            mask = to_mask.Not().And(cloud_free.Or(keepClouds))
        else:
            mask = to_mask.Not().And(cloud_free)
        return self.image.updateMask(mask)
