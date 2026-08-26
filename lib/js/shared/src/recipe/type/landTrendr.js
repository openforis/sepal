import {defineRecipeType} from '../defineRecipeType.js'
import {fromAoi} from '../source/aoi.js'
import {CLASSIFICATION_SOURCE, fromCollectionSources, SOURCE_IMAGERY} from '../source/collectionSources.js'

// LandTrendr segments a yearly index series over its AOI (lib/js/ee/src/timeSeries/landTrendr.js). It has no
// imageFactory call of its own and reaches both of its dependencies through shared helpers: `model.aoi`
// through toGeometry$, and `model.sources` through getCollection$ - the same collection owner CCDC, Time
// Series and Phenology use. It rebuilds a per-year collection recipe around its own dates and hands the
// sources submodel through unchanged, so it inherits that submodel's contract in full.
//
// What that contract resolves is not uniform. A classification is always resolved, because getCollection$
// loads it before it chooses a branch. An asset list is resolved only on the Planet branch. LandTrendr's own
// sources panel offers optical data sets only (recipe/landTrendr/panels/sources/sources.jsx renders
// opticalDataSetOptions) and writes neither field, so a recipe saved through the GUI carries no
// classification and no assets, and its data sets select Optical. An asset list that arrives some other way -
// an older model, a programmatic one - is therefore ignored while those data sets stand.
//
// The full collection contract is declared here rather than just the AOI because the helper decides which
// half applies from the data sets, and that decision is shared with execution.
//
// `sources.dataSets` holds catalogue identifiers - LANDSAT, SENTINEL_2 - and `sources.index` is a band name.
// Neither is a reference.

export {CLASSIFICATION_SOURCE, SOURCE_IMAGERY}

export default defineRecipeType({
    type: 'LANDTRENDR',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromCollectionSources(model)
    ]
})
