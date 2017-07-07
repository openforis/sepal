from ..image_operation import ImageOperation


class SecondPass(ImageOperation):
    def __init__(self, image):
        super(SecondPass, self).__init__(image)

    def apply(self,
              maybeWater,
              max_water_cloud_score,
              max_land_cloud_score,
              median_shadow_free_cloud_score,
              mosaic_def):
        hasBothWaterAndLand = max_water_cloud_score.gt(0).And(max_land_cloud_score.gt(0))

        water_cloud_score = self.image.select('waterCloudScore')
        has_perfect_water_cloud_score = max_water_cloud_score.eq(10000)
        clear_sky_water = has_perfect_water_cloud_score.And(water_cloud_score.eq(10000)) \
            .Or(has_perfect_water_cloud_score.Not()
                .And(water_cloud_score.lt(max_water_cloud_score.multiply(0.99)))) \
            .And(self.image.select('water')) \
            .And(hasBothWaterAndLand.Not().Or(maybeWater))

        land_cloud_score_threshold = max_land_cloud_score.multiply(0.99)
        clear_sky_land = self.image.select('landCloudScore').gte(land_cloud_score_threshold) \
            .And(self.image.select('water').Not())

        shadow_free = self.image.select('shadowFree')
        mostly_no_shadows = median_shadow_free_cloud_score.gte(land_cloud_score_threshold)
        mostly_shadows = mostly_no_shadows.Not()
        shadow_tolerance = mosaic_def.shadow_tolerance if mosaic_def.shadow_tolerance >= 0 else 1
        not_too_much_shadow = self.image.select('shadowScore').gte(1400 * (1 - shadow_tolerance))

        mask = clear_sky_water.Or(clear_sky_land) \
            .And(mostly_no_shadows.And(shadow_free)
                 .Or(mostly_shadows.And(not_too_much_shadow))
                 )

        return self.image.updateMask(mask)
