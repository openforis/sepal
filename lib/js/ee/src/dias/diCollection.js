import ee from '#sepal/ee/ee'
import {allScenes as createOpticalCollection} from '#sepal/ee/optical/collection'
import {calculateIndex} from '#sepal/ee/optical/indexes'
import {createCollection as createPlanetCollection} from '#sepal/ee/planet/collection'
import {createCollection as createRadarCollection} from '#sepal/ee/radar/collection'

// Same tie-break order the paper uses for same-day observations from different
// sensors: Sentinel-1, Landsat, Sentinel-2, Planet.
export const SOURCE_ID = {
    SENTINEL_1: 1,
    LANDSAT: 2,
    SENTINEL_2: 3,
    PLANET: 4
}

const STATS_REDUCER = ee.Reducer.mean().combine(ee.Reducer.stdDev(), null, true)

// Per-pixel cloud/shadow masking, keyed by an OFF/LIGHT/MODERATE/AGGRESSIVE
// level applied uniformly across every masking method instead of exposing
// each threshold separately. DI is a per-pixel Z-score, so an unmasked cloud
// or shadow pixel (which looks nothing like forest spectrally) reads as an
// extreme, spurious disturbance signal - the paper explicitly masks clouds
// per sensor (Section 2.2) for the same reason.
//
// Cost varies a lot between methods: landsatCFMask reads bits already present
// on the image's QA band, and sentinel2CloudScorePlus thresholds an already-
// precomputed band - both essentially free. sepalCloudScore computes a
// spectral cloud score from scratch per pixel - real but modest cost. The
// separate `shadowMasking` flag (off here, and not set by opticalMosaicRecipe.js
// either) is the expensive one: maskShadows.js reduces a median across the
// *entire* collection before any single image can be masked, which is what
// was driving on-the-fly timeouts - so no level here turns it on. LIGHT skips
// sepalCloudScore too, for interactive/on-the-fly use where minimizing
// compute matters more than catching every marginal cloud.
const opticalCloudMasking = level => {
    if (level === 'OFF') {
        return {includedCloudMasking: [], shadowMasking: 'OFF', snowMasking: 'OFF'}
    }
    if (level === 'LIGHT') {
        return {
            includedCloudMasking: ['landsatCFMask', 'sentinel2CloudScorePlus'],
            sentinel2CloudScorePlusBand: 'cs_cdf',
            sentinel2CloudScorePlusMaxCloudProbability: 45,
            landsatCFMaskCloudMasking: 'MODERATE',
            landsatCFMaskCloudShadowMasking: 'MODERATE',
            landsatCFMaskCirrusMasking: 'MODERATE',
            landsatCFMaskDilatedCloud: 'REMOVE',
            shadowMasking: 'OFF',
            cloudBuffer: 0,
            holes: 'ALLOW',
            snowMasking: 'OFF'
        }
    }
    const aggressive = level === 'AGGRESSIVE'
    return {
        includedCloudMasking: ['sepalCloudScore', 'landsatCFMask', 'sentinel2CloudScorePlus'],
        sentinel2CloudProbabilityMaxCloudProbability: aggressive ? 40 : 65,
        sentinel2CloudScorePlusBand: 'cs_cdf',
        sentinel2CloudScorePlusMaxCloudProbability: aggressive ? 30 : 45,
        landsatCFMaskCloudMasking: level,
        landsatCFMaskCloudShadowMasking: level,
        landsatCFMaskCirrusMasking: level,
        landsatCFMaskDilatedCloud: 'REMOVE',
        sepalCloudScoreMaxCloudProbability: aggressive ? 20 : 30,
        shadowMasking: 'OFF',
        cloudBuffer: 0,
        holes: 'ALLOW',
        snowMasking: 'ON'
    }
}

// DI = (pixel value - mean) / stdDev, where mean/stdDev come from forest-masked
// pixels within this same image (not a historical archive) - Section 2.2 of the
// paper. `band` must already be a single-band, forest-sensitive metric (NDVI, NBR
// or VH backscatter). The reduceRegion scale is adaptive (capped, not native
// resolution) since it only needs to be representative of the forest population,
// not exact - same approach used for forest-population stats in bayts.js.
const toDiImage = ({image, band, sourceId, forestMask}) => {
    const value = image.select(band)
    const region = image.geometry().intersection(forestMask.geometry(), 10)
    const stats = value
        .updateMask(forestMask.select(0))
        .reduceRegion({
            reducer: STATS_REDUCER,
            geometry: region,
            scale: region.area().divide(4).min(1000),
            bestEffort: true,
            tileScale: 16
        })
    // stats.toImage() (not Image.constant(stats.get(...))) so that an image whose
    // footprint barely overlaps the forest mask - producing an empty reduceRegion
    // result - yields a masked DI band instead of a hard EE error ("Parameter
    // 'value' is required and may not be null"). Same technique bayts.js uses.
    const statsImage = stats.toImage()
    const mean = statsImage.select(`${band}_mean`)
    const stdDev = statsImage.select(`${band}_stdDev`)
    const di = value.subtract(mean).divide(stdDev)
    const date = image.date()
    const ydoy = date.get('year').multiply(1000).add(date.getRelative('day', 'year')).add(1)
    const sdoy = ydoy.multiply(10).add(sourceId)
    return ee.Image.cat([
        di.rename('DI'),
        ee.Image.constant(sourceId).rename('source'),
        ee.Image.constant(ydoy).rename('ydoy')
    ])
        .updateMask(value.mask())
        .float()
        .set('ydoy', ydoy)
        .set('sdoy', sdoy)
        .set('source', sourceId)
        .set('system:time_start', image.get('system:time_start'))
}

const landsatDi = ({geometry, startDate, endDate, dataSets, forestMask, cloudMasking}) => {
    const collection = createOpticalCollection({
        geometry,
        dataSets,
        reflectance: 'SR',
        calibrate: true,
        cloudPercentageThreshold: 100,
        filters: [],
        dates: {seasonStart: startDate, seasonEnd: endDate},
        ...opticalCloudMasking(cloudMasking)
    })
    return collection.map(image =>
        toDiImage({
            image: image.addBands(calculateIndex(image, 'nbr')),
            band: 'nbr',
            sourceId: SOURCE_ID.LANDSAT,
            forestMask
        })
    )
}

const sentinel2Di = ({geometry, startDate, endDate, forestMask, cloudMasking}) => {
    const collection = createOpticalCollection({
        geometry,
        dataSets: ['SENTINEL_2'],
        reflectance: 'SR',
        calibrate: true,
        cloudPercentageThreshold: 100,
        filters: [],
        dates: {seasonStart: startDate, seasonEnd: endDate},
        ...opticalCloudMasking(cloudMasking)
    })
    return collection.map(image =>
        toDiImage({
            image: image.addBands(calculateIndex(image, 'ndvi')),
            band: 'ndvi',
            sourceId: SOURCE_ID.SENTINEL_2,
            forestMask
        })
    )
}

const sentinel1Di = ({geometry, startDate, endDate, orbits, forestMask}) => {
    const collection = createRadarCollection({
        startDate,
        endDate,
        targetDate: startDate,
        geometry,
        orbits,
        geometricCorrection: 'TERRAIN',
        spatialSpeckleFilter: 'REFINED_LEE',
        kernelSize: 5
    })
    return collection.map(image =>
        toDiImage({
            image,
            band: 'VH',
            sourceId: SOURCE_ID.SENTINEL_1,
            forestMask
        })
    )
}

const planetDi = ({geometry, startDate, endDate, asset, forestMask}) => {
    const collection = createPlanetCollection({
        startDate,
        endDate,
        geometry,
        sources: {source: 'DAILY', assets: [asset]},
        histogramMatching: 'DISABLED',
        cloudThreshold: 0.2,
        cloudBuffer: 0
    })
    return collection.map(image =>
        toDiImage({
            image: image.addBands(calculateIndex(image, 'ndvi')),
            band: 'ndvi',
            sourceId: SOURCE_ID.PLANET,
            forestMask
        })
    )
}

// Builds the merged, interoperable DI stream across every enabled sensor - the
// analog of dias_runner.py's build_di_collection(), except each per-sensor
// collection is computed from raw imagery here instead of being read from a
// precomputed DI asset.
export const buildDiCollection = ({recipe, geometry, forestMask}) => {
    const {sources, dates: {startDate, endDate}, diasOptions: {cloudMasking}} = recipe.model
    const collections = []

    if (sources.landsat?.enabled) {
        collections.push(landsatDi({
            geometry, startDate, endDate, forestMask, cloudMasking,
            dataSets: sources.landsat.dataSets
        }))
    }
    if (sources.sentinel2?.enabled) {
        collections.push(sentinel2Di({geometry, startDate, endDate, forestMask, cloudMasking}))
    }
    if (sources.sentinel1?.enabled) {
        collections.push(sentinel1Di({
            geometry, startDate, endDate, forestMask,
            orbits: sources.sentinel1.orbits
        }))
    }
    if (sources.planet?.enabled) {
        collections.push(planetDi({
            geometry, startDate, endDate, forestMask,
            asset: sources.planet.asset
        }))
    }

    return collections
        .reduce((merged, collection) => merged.merge(collection), ee.ImageCollection([]))
        .sort('sdoy')
}
