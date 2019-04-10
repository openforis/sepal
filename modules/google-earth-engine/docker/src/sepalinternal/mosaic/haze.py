from ..image_operation import ImageOperation
import ee

def mask_haze(mosaic_def, collection):
    if mosaic_def.haze_tolerance == 1:
        return collection  # No point of reducing and mapping the collection if we have full haze tolerance

    max_haze_score = collection.select('hazeScore').max()

    return collection.map(
        lambda image: _MaskHaze(image).apply(mosaic_def.haze_tolerance, max_haze_score))


class _MaskHaze(ImageOperation):
    def __init__(self, image):
        super(_MaskHaze, self).__init__(image)

    def apply(self, haze_tolerance, max_haze_score):
        score_threshold = max_haze_score.multiply(1 - haze_tolerance)

        if haze_tolerance > 0:
            score_threshold = score_threshold.min(9100)

        mask = self.toImage('hazeScore').gte(score_threshold)
        return self.image.updateMask(mask)
