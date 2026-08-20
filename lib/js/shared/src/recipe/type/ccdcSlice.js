import {defineRecipeType} from '../defineRecipeType.js'
import {fromSelection} from '../source/extract.js'

// CCDC Slice selects one source and stores it wearing a copied description: `model.source` is
// {type, id} alongside the bands, base bands, segment bands, date interpretation and visualizations that
// sourceSync copied off it, plus `targetType` recording what an asset-backed recipe resolved to.
//
// Only the type and id are structure - imageFactory reads nothing else (lib/js/ee/src/timeSeries/
// ccdcSlice.js) - so one selection is exactly one edge, and the recipe the user selected stays the
// reference even when the snapshot was copied from the asset behind it.

export const PRIMARY_IMAGE = 'PRIMARY_IMAGE'

export default defineRecipeType({
    type: 'CCDC_SLICE',
    directSources: model =>
        fromSelection({model, keys: ['source'], role: PRIMARY_IMAGE})
})
