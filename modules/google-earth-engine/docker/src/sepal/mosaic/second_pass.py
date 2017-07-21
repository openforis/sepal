from ..image_operation import ImageOperation


class SecondPass(ImageOperation):
    def __init__(self, image):
        super(SecondPass, self).__init__(image)

    def apply(self,
              max_land_score,
              max_water_score,
              median_shadow_free_score,
              mosaic_def,
              snow_exists):
        mostly_land = max_land_score.gt(max_water_score)
        water = self.image.select('water')

        land_score = self.image.select('landScore')
        land_score_threshold = max_land_score.subtract(100).min(9500)
        cloud_free_land = land_score.gte(land_score_threshold) \
            .And(water.Not()) \
            .And(mostly_land)

        water_score = self.image.select('waterScore')
        water_score_threshold = max_water_score.subtract(100).min(9500)
        cloud_free_water = water_score.gte(water_score_threshold) \
            .And(water) \
            .And(mostly_land.Not())

        shadow_free = self.image.select('shadowFree')
        mostly_no_shadows = median_shadow_free_score.gte(land_score_threshold)
        mostly_shadows = mostly_no_shadows.Not()
        not_too_much_shadow = self.image.select('shadowScore').gte(1400 * (1 - mosaic_def.shadow_tolerance))

        snow = self.image.select('snow') \
            .Or(water.And(snow_exists))  # Probably water with shadows misclassified as snow

        mask = cloud_free_land.Or(cloud_free_water) \
            .And(
            mostly_no_shadows.And(shadow_free).Or(
                mostly_shadows.And(not_too_much_shadow)
            )
        )

        if mosaic_def.mask_snow:
            mask = mask.And(snow.Not())

        return self.image \
            .updateMask(mask)
