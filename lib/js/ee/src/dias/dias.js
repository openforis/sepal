import {forkJoin, map, switchMap} from 'rxjs'

import {toGeometry$} from '#sepal/ee/aoi'
import ee from '#sepal/ee/ee'
import imageFactory from '#sepal/ee/imageFactory'

import {confirmAlerts} from './alertConfirmation.js'
import {buildDiCollection} from './diCollection.js'

// Entry point registered under 'DIAS' in imageFactory.js. Analog of
// dias_runner.py's run_dias()/dias_alert(), except DI is computed from raw
// per-sensor imagery here (diCollection.js) rather than read from a precomputed
// DI asset, and the forest mask is a recipe input (ASSET or RECIPE_REF) resolved
// the same way `masking.js` resolves its mask image.
const dias = recipe => {
    const {diasOptions} = recipe.model

    const getImage$ = () =>
        forkJoin({
            geometry: toGeometry$(recipe.model.aoi),
            forestMask: imageFactory(recipe.model.forestMask).getImage$()
        }).pipe(
            map(({geometry, forestMask}) => {
                const diCollection = buildDiCollection({recipe, geometry, forestMask})
                const confirmed = confirmAlerts({
                    collection: diCollection,
                    threshold: diasOptions.threshold,
                    observations: diasOptions.consecutiveObservations,
                    regionName: recipe.title || recipe.placeholder,
                    processDate: new Date().toISOString().slice(0, 10)
                })
                return confirmed
                    .updateMask(forestMask.select(0))
                    .clip(geometry)
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
