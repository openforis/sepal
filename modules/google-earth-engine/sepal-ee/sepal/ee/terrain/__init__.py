import math

import ee


def create_terrain_image():
    elevation = ee.Image("USGS/SRTMGL1_003")
    topography = ee.Algorithms.Terrain(elevation)
    aspect_rad = topography.select(['aspect']).multiply(ee.Number(math.pi).divide(180))
    eastness = aspect_rad.sin().rename(['eastness']).float()
    northness = aspect_rad.cos().rename(['northness']).float()
    return topography.select(['elevation', 'slope', 'aspect']) \
        .addBands(eastness) \
        .addBands(northness)
