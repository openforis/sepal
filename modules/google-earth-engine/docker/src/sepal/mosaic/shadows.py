import ee

from ..image_operation import ImageOperation


def mask_shadows(mosaic_def, collection):
    reduced = collection.select('shadowScore')\
        .reduce(ee.Reducer.percentile([0, 50, 100]).combine(ee.Reducer.stdDev(), '', True))
    shadowScoreMedian = reduced.select('shadowScore_p50')
    shadowScoreMax = reduced.select('shadowScore_p100')
    darkOutlierThreshold = shadowScoreMedian.multiply(0.7)  # Outlier if it's a lot darker than the median

    return collection.map(
        lambda image: _MaskShadows(image, mosaic_def).apply(shadowScoreMax, darkOutlierThreshold, reduced))


class _MaskShadows(ImageOperation):
    def __init__(self, image, mosaic_def):
        super(_MaskShadows, self).__init__(image)
        self.mosaic_def = mosaic_def

    def apply(self, shadowScoreMax, darkOutlierThreshold, reduced):
        def not_outlier(band, minDiff):
            return reduced.expression('abs(band - median) <= max(2 * stdDev, minDiff)', {
                'band': self.image.select(band),
                'median': reduced.select(band + '_p50'),
                'stdDev': reduced.select(band + '_stdDev'),
                'minDiff': minDiff
            })

        self.set('shadowThreshold',
                 'i.shadowThreshold * (1 - {shadowTolerance})', {
                     'shadowTolerance': self.mosaic_def.shadow_tolerance
                 })
        self.set('shadowThreshold',
                 darkOutlierThreshold.max(self.toImage('shadowThreshold')))
        self.setIf('shadowThreshold',
                   self.toImage('shadowThreshold').gt(shadowScoreMax),
                   shadowScoreMax)

        mask = self.toImage('i.shadowScore >= i.shadowThreshold') \
            .And(not_outlier('shadowScore', 300)) \
            .Or(self.toImage('cloud'))

        return self.image.updateMask(mask)
