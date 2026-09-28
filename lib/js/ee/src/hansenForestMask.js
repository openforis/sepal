import {of} from 'rxjs'

import ee from '#sepal/ee/ee'

// Bump as UMD publishes newer Hansen Global Forest Change releases
// (roughly annual) - this is the only place the version needs to change.
const GFC_ASSET_ID = 'UMD/hansen/global_forest_change_2025_v1_13'

// A pixel counts as forest if it had at least `threshold`% tree canopy
// cover in 2000 and wasn't already lost before `year` - loss recorded in
// `year` itself or later still leaves it standing forest going into the
// start of the analysis period, which is what a pre-disturbance baseline
// needs to see.
//
// Hansen GFC is a seamless global asset with no intrinsic bounded footprint
// (unlike a typical uploaded forest-mask asset, which is already clipped to
// some area) - EE treats it as "unbounded", which breaks any reduceRegion
// call downstream that doesn't pass its own geometry. Clipping to the
// recipe's AOI here keeps this mask interchangeable with the ASSET/
// RECIPE_REF forest mask types, which are bounded by construction.
const hansenForestMask = ({threshold, year, geometry}) => {
    // Guards a bad persisted value (e.g. NaN from a recipe saved before
    // forestMask.jsx validated this) - .gte(NaN) is false for every pixel,
    // which masks out the whole image with no error to show for it.
    const safeThreshold = Number.isFinite(threshold) ? threshold : 30
    const getImage$ = () => {
        const gfc = ee.Image(GFC_ASSET_ID)
        const wasForest = gfc.select('treecover2000').gte(safeThreshold)
        // .unmask(0): .and() intersects masks, not just values - if lossyear
        // is masked (rather than an explicit 0) wherever no loss was ever
        // recorded, combining it in below would mask out every undisturbed
        // forest pixel too, even though logically they should count as
        // forest. Forcing an explicit 0 avoids that regardless of which way
        // the source band actually represents "no loss".
        const lossYear = gfc.select('lossyear').unmask(0) // 0 = no loss; 1-N = loss in calendar year 2000+N
        const lostBeforeYear = lossYear.gt(0).and(lossYear.add(2000).lt(year))
        const forestMask = wasForest.and(lostBeforeYear.not()).rename('forestMask').selfMask()
        return of(forestMask.clip(geometry))
    }
    return {
        getImage$,
        getBands$() {
            return of(['forestMask'])
        },
        getGeometry$() {
            return of(geometry)
        }
    }
}

export default hansenForestMask
