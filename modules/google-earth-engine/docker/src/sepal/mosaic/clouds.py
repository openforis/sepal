import ee

from ..image_operation import ImageOperation


def mask_clouds(mosaic_def, collection):
    reduced = collection.select('cloud') \
        .reduce(ee.Reducer.sum()
                .combine(ee.Reducer.count(), "", True)
                .combine(ee.Reducer.min(), "", True))

    # Proportion of pixels that are cloudy
    cloudProportion = reduced.select('cloud_sum').divide(10000) \
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
    # TODO: Improve this...
    keepClouds = cloudProportionDiff.gt(0.4).And(normalCloudProportion.lt(0.3)) \
        .Or(onlyClouds)

    return collection.map(lambda image: _MaskClouds(image, mosaic_def).apply(keepClouds))


class _MaskClouds(ImageOperation):
    def __init__(self, image, mosaic_def):
        super(_MaskClouds, self).__init__(image)
        self.mosaic_def = mosaic_def

    def apply(self, keepClouds):
        cloudFree = self.toImage('!i.cloud')

        mask = cloudFree.Or(keepClouds)

        return self.image.updateMask(mask)
