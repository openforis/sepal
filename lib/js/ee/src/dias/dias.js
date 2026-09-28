import {map, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'

import {confirmAlerts} from './alertConfirmation.js'
import {buildDiCollection} from './diCollection.js'

// Entry point registered under 'DIAS' in imageFactory.js. Analog of
// dias_runner.py's run_dias()/dias_alert(), except DI is computed from raw
// per-sensor imagery here (diCollection.js) rather than read from a precomputed
// DI asset, and the forest mask is a recipe input (ASSET, RECIPE_REF or HANSEN)
// resolved the same way `masking.js` resolves its mask image.
const dias = recipe => {
    const {diasOptions} = recipe.model

    const getImage$ = () =>
        toGeometry$(recipe.model.aoi).pipe(
            switchMap(geometry => {
                // year/geometry: only used by the HANSEN forest mask type,
                // harmless for the others (ASSET/RECIPE_REF just ignore the
                // extra fields). "year" is the start of the DI observation
                // window, so a loss recorded in that year or later still
                // counts as forest for the pre-disturbance baseline. Hansen
                // GFC is an unbounded global asset - without clipping it to
                // the AOI here, diCollection.js's reduceRegion calls fail
                // with "Provide 'geometry' parameter when aggregating over
                // an unbounded image" (see hansenForestMask.js).
                const forestMaskModel = {
                    ...recipe.model.forestMask,
                    year: parseInt(recipe.model.dates.startDate.slice(0, 4), 10),
                    geometry
                }
                return imageFactory(forestMaskModel).getImage$().pipe(
                    map(forestMask => {
                        const diCollection = buildDiCollection({recipe, geometry, forestMask})
                        const confirmed = confirmAlerts({
                            collection: diCollection,
                            threshold: diasOptions.threshold,
                            observations: diasOptions.consecutiveObservations,
                            regionName: recipe.title || recipe.placeholder,
                            processDate: new Date().toISOString().slice(0, 10)
                        })
                        // forest_mask is added onto the forest mask image
                        // (not the other way around) so its visibility is
                        // never at the mercy of confirmed's own footprint -
                        // confirmed may legitimately cover nothing (no
                        // alerts in this AOI/period), but the forest mask
                        // should still render regardless of alert state.
                        return forestMask.select(0).rename('forest_mask')
                            .addBands(confirmed.updateMask(forestMask.select(0)))
                            .clip(geometry)
                    })
                )
            })
        )

    return {
        getImage$,
        getBands$() {
            return getImage$().pipe(
                switchMap(image => ee.getInfo$(image.bandNames(), 'dias band names'))
            )
        },
        getGeometry$() {
            return toGeometry$(recipe.model.aoi)
        }
    }
}

export default dias
