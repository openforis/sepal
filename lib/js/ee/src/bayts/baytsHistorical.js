import {map, of, throwError, zip} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'
import {
    baytsHistoricalBandNames,
    baytsHistoricalRefusals,
    ORBIT_SUFFIXES
} from '#sepal/recipe/type/baytsHistorical'

// `outputBands` names the bands an operation wants back, and exactly those are returned in that order; a bare
// `selection` is not a request for bands here. Otherwise every pass's statistics are returned, in the order the model
// stores the passes. Either way a band the image lacks - speckle statistics a pass without imagery never supplied
// included - fails the request.
const baytsHistorical = (recipe, {outputBands} = {}) => {
    const model = recipe.model
    return {
        getImage$() {
            return zip(...model.options.orbits.map(orbitPass => {
                const singleOrbitRecipe = {
                    ...recipe,
                    type: 'RADAR_MOSAIC',
                    options: {
                        ...recipe.model.options,
                        orbits: [orbitPass]
                    }
                }
                return imageFactory(singleOrbitRecipe, {selection: ['VV_mean', 'VV_std', 'VH_mean', 'VH_std', 'orbit']}).getImage$().pipe(
                    map(image => {
                        const speckleStats = determineSpeckleStats(image, orbitPass, recipe.model.options)
                        return image
                            .addBands(speckleStats)
                            .regexpRename('(.*)', `$1_${ORBIT_SUFFIXES[orbitPass]}`, false)
                    })
                )
            })
            ).pipe(
                map(images => ee.Image.cat(...images)
                    .select(outputBands?.length ? outputBands : baytsHistoricalBandNames(model)))
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
