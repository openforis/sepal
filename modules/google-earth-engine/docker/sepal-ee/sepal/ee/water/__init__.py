import ee
from sepal.ee.image import list_to_image


def create_surface_water_image():
    water = ee.Image("JRC/GSW1_0/GlobalSurfaceWater").unmask()
    transitions = [
        'no_change',
        'permanent',
        'new_permanent',
        'lost_permanent',
        'seasonal',
        'new_seasonal',
        'lost_seasonal',
        'seasonal_to_permanent',
        'permanent_to_seasonal',
        'ephemeral_permanent',
        'ephemeral_seasonal'
    ]
    transition_masks = list_to_image([
        water.select('transition').eq(i).rename('water_' + transition)
        for i, transition in enumerate(transitions)
    ])

    return water \
        .select(
            ['occurrence', 'change_abs', 'change_norm', 'seasonality', 'max_extent'],
            ['water_occurrence', 'water_change_abs', 'water_change_norm', 'water_seasonality', 'water_max_extent']
        ) \
        .addBands(transition_masks)
