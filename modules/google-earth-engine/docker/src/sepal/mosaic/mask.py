from ..image_operation import ImageOperation


class Mask(ImageOperation):
    def __init__(self, image):
        super(Mask, self).__init__(image)

    def apply(self,
              max_cloud_score,
              median_shadow_free_cloud_score,
              mostly_water,
              shadow_tolerance,
              mask_water,
              mask_snow):
        cloud_score_threshold = max_cloud_score.multiply(0.99)
        cloud_free = self.image.select('cloudScore').gte(cloud_score_threshold)
        mostly_no_shadows = median_shadow_free_cloud_score.gte(cloud_score_threshold)
        mostly_shadows = mostly_no_shadows.Not()
        shadow_free = self.image.select('shadowFree')
        not_too_much_shadow = self.image.select('shadowScore').gte(0.14 - 0.14 * shadow_tolerance)
        not_water = self.image.select('clearSkyWater').Not()
        not_snow = self.image.select('snowTest').Not()

        mask = cloud_free.And(
            mostly_no_shadows.And(shadow_free).Or(
                mostly_shadows.And(not_too_much_shadow)
            )
        )

        if mask_water:
            mask = mask.And(not_water)
        else:
            mask = mask.And(not_water.Or(mostly_water))

        if mask_snow:
            mask = mask.And(not_snow)

        return self.image \
            .updateMask(mask)
