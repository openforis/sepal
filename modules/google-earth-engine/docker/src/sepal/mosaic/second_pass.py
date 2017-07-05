from ..image_operation import ImageOperation


class SecondPass(ImageOperation):
    def __init__(self, image):
        super(SecondPass, self).__init__(image)

    def apply(self,
              max_water_cloud_score,
              max_land_cloud_score,
              median_shadow_free_cloud_score,
              mosaic_def):
        shadow_tolerance = mosaic_def.shadow_tolerance if mosaic_def.shadow_tolerance >= 0 else 0.5

        water_cloud_score_threshold = max_water_cloud_score.multiply(0.99)
        clear_sky_water = self.select('waterCloudScore').gte(water_cloud_score_threshold) \
            .And(self.select('water'))

        land_cloud_score_threshold = max_land_cloud_score.multiply(0.99)
        clear_sky_land = self.select('landCloudScore').gte(land_cloud_score_threshold) \
            .And(self.select('water').Not())

        shadow_free = self.select('shadowFree')
        mostly_no_shadows = median_shadow_free_cloud_score.gte(land_cloud_score_threshold)
        mostly_shadows = mostly_no_shadows.Not()
        not_too_much_shadow = self.select('shadowScore').gte(1400 * (1 - shadow_tolerance))

        mask = clear_sky_land.And(
            mostly_no_shadows.And(shadow_free).Or(
                mostly_shadows.And(not_too_much_shadow)
            )
        )

        # .Or(clear_sky_water)

        return self.image.updateMask(mask)
