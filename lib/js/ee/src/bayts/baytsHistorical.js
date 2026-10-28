import {map, of, switchMap, throwError, zip} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {hasImagery} from '#sepal/ee/radar/collection'
import {validateEEImage} from '#sepal/ee/validate'
import {
    baytsHistoricalBandNames,
    baytsHistoricalRefusals,
    HISTORICAL_STATISTICS,
    ORBIT_SUFFIXES
} from '#sepal/recipe/type/baytsHistorical'

// `outputBands` names the bands an operation wants back, and exactly those are returned in that order; a bare
// `selection` is not a request for bands here. Otherwise every pass's statistics are returned, in the order the model
// stores the passes. A band the image lacks fails the request.
//
// Each pass is built from that pass's imagery alone. A pass without scenes in the period keeps its bands, fully
// masked; a history none of whose passes has scenes is refused, whatever is asked of it.
const baytsHistorical = (recipe, {outputBands} = {}) => {
    const model = recipe.model
    return {
        getImage$() {
            return toGeometry$(model.aoi).pipe(
                switchMap(geometry => {
                    const {fromDate: startDate, toDate: endDate} = model.dates
                    const passes = model.options.orbits.map(orbitPass => ({
                        orbitPass,
                        hasScenes: hasImagery({geometry, startDate, endDate, orbits: [orbitPass]})
                    }))
                    return zip(...passes.map(({orbitPass, hasScenes}) =>
                        passStatistics$(recipe, orbitPass).pipe(
                            map(statistics => ee.Image(
                                ee.Algorithms.If(hasScenes, statistics, maskedPass(orbitPass, geometry))
                            ))
                        )
                    )).pipe(
                        map(images => validateEEImage({
                            valid: ee.List(passes.map(({hasScenes}) => hasScenes)).reduce(ee.Reducer.anyNonZero()),
                            image: ee.Image.cat(...images)
                                .select(outputBands?.length ? outputBands : baytsHistoricalBandNames(model)),
                            error: NO_IMAGES
                        }))
                    )
                })
            )
        },
        // The declared output, read from the configuration alone; orbits it cannot name bands for are refused.
        getBands$() {
            const refusals = baytsHistoricalRefusals(model)
            return refusals.length
                ? throwError(() => new Error(`BAYTS Historical orbits are unusable: ${refusals.map(({code}) => code).join(', ')}`))
                : of(baytsHistoricalBandNames(model))
        },
        getGeometry$() {
            return toGeometry$(model.aoi)
        }
    }
}

const passStatistics$ = (recipe, orbitPass) => {
    const singlePassRecipe = {
        ...recipe,
        type: 'RADAR_MOSAIC',
        model: {
            ...recipe.model,
            options: {
                ...recipe.model.options,
                orbits: [orbitPass]
            }
        }
    }
    return imageFactory(singlePassRecipe, {selection: ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit']}).getImage$().pipe(
        map(image => {
            const speckleStats = determineSpeckleStats(image, orbitPass, recipe.model.options)
            return image
                .addBands(speckleStats)
                .regexpRename('(.*)', `$1_${ORBIT_SUFFIXES[orbitPass]}`, false)
        })
    )
}

const NO_IMAGES = {
    userMessage: {
        message: 'All images have been filtered out. Update the recipe to ensure at least one image is included.',
        key: 'process.mosaic.error.noImages'
    },
    statusCode: 400
}

// Bounded to the AOI: BAYTS monitors over the history's geometry.
const maskedPass = (orbitPass, geometry) =>
    ee.Image.constant(HISTORICAL_STATISTICS.map(() => 0))
        .rename(baytsHistoricalBandNames({options: {orbits: [orbitPass]}}))
        .float()
        .updateMask(0)
        .clip(geometry)

const determineSpeckleStats = (image, orbitPass, {spatialSpeckleFilter, multitemporalSpeckleFilter}) => {
    const applyMultitemporalSpeckleFilter = multitemporalSpeckleFilter && multitemporalSpeckleFilter !== 'NONE'
        && spatialSpeckleFilter && spatialSpeckleFilter !== 'NONE'
    const stats = applyMultitemporalSpeckleFilter
        ? ee.ImageCollection(image.get('speckleStatsCollection'))
            .filter(ee.Filter.eq('orbitProperties_pass', orbitPass))
            .map(function (speckleStats) {
                return speckleStats
                    .updateMask(
                        image.select('orbit').eq(speckleStats.getNumber('relativeOrbitNumber_start'))
                    )
            })
            .mosaic()
            .regexpRename('(.*)', '$1_speckle', false)
        : ee.Image(['VV', 'VH'].map(function (bandName) {
            return ee.Image(1).rename(bandName).regexpRename('(.*)', '$1_speckle', false).clip(image.geometry())
        }))
    return stats.float()
}

export default baytsHistorical
