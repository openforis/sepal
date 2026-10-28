import ee from '#sepal/ee/ee'
import {AUXILIARY_BANDS, WATER_MEASURES, WATER_TRANSITIONS, waterBand} from '#sepal/recipe/auxiliaryImagery'

// The covariates a classifier's image is given beside its input image's band sets, each selecting the bands the shared
// declaration names, so a name the two disagree on fails here rather than training on what validation never saw.
export const auxiliaryImage = auxiliaryImagery =>
    ee.Image(
        auxiliaryImagery.map(type => {
            switch (type) {
                case 'LATITUDE':
                    return createLatitudeImage().select(AUXILIARY_BANDS.LATITUDE)
                case 'TERRAIN':
                    return createTerrainImage().select(AUXILIARY_BANDS.TERRAIN)
                case 'WATER':
                    return createSurfaceWaterImage().select(AUXILIARY_BANDS.WATER)
            }
        })
    )

const createLatitudeImage = () =>
    ee.Image.pixelLonLat().select('latitude').float()

const createTerrainImage = () => {
    const elevation = ee.Image('USGS/SRTMGL1_003')
    const topography = ee.Algorithms.Terrain(elevation)
    const aspectRad = topography.select(['aspect']).multiply(ee.Number(Math.PI).divide(180))
    const eastness = aspectRad.sin().rename(['eastness']).float()
    const northness = aspectRad.cos().rename(['northness']).float()
    return topography.select(['elevation', 'slope', 'aspect'])
        .addBands(eastness, null, true)
        .addBands(northness, null, true)
}

const createSurfaceWaterImage = () => {
    const water = ee.Image('JRC/GSW1_0/GlobalSurfaceWater').unmask()
    const transitionMasks = ee.Image(
        WATER_TRANSITIONS.map((transition, i) =>
            water.select('transition').eq(i).rename(waterBand(transition)))
    )
    return water
        .select(WATER_MEASURES, WATER_MEASURES.map(waterBand))
        .addBands(transitionMasks, null, true)
}
