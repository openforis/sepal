import {defineRecipeType} from '../defineRecipeType.js'
import {OPTICAL_STORED_PER_UNIT} from '../optical/encoding.js'
import {getAvailableIndexes} from '../optical/opticalBands.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'
import {fromSourceAssets, SOURCE_IMAGERY} from '../source/collectionSources.js'

// A Planet mosaic merges the ImageCollections named in `model.sources.assets`, in model order, and clips to
// its AOI (lib/js/ee/src/planet/mosaic.js). It never classifies, so it takes the asset half of the shared
// collection submodel and not the classification half.
//
// When `sources` is absent entirely the implementation falls back to three hardcoded NICFI collections. Those
// are fixed in the implementation rather than selected, so an unconfigured recipe declares no assets.

export {SOURCE_IMAGERY}

// The Planet collections a recipe selects from, by the data set it names.
export const PLANET_SOURCES = ['NICFI', 'BASEMAPS', 'DAILY']

// The spectral bands every branch composites: what the basemap and histogram-matching paths select from each image,
// and what every Daily image carries.
export const PLANET_MOSAIC_SPECTRAL_BANDS = ['blue', 'green', 'red', 'nir']

// The indexes those bands support, in the order execution adds them.
export const PLANET_MOSAIC_INDEXES = getAvailableIndexes(PLANET_MOSAIC_SPECTRAL_BANDS)

// Stored at ten thousand per unit. The composite stores every index that way, and histogram matching maps Daily
// imagery onto a Landsat reference built at that scale. Any other spectral band keeps its assets' own scaling, which
// the configuration does not state.
const PER_TEN_THOUSAND = {scale: 1 / OPTICAL_STORED_PER_UNIT, offset: 0, unit: '1'}

// The public output, the same on every branch and known from the configuration alone. What a branch builds beyond it
// for an empty request - Daily without histogram matching keeps its working bands, and PSB.SD imagery its other
// bands - is not part of it, though an explicit request for such a band still builds where the branch carries it.
// Having no imagery to composite, or members Earth Engine cannot composite together, makes a recipe fail when run,
// not describe different bands.
export const planetMosaicBands = model => {
    const spectralEncoding = isHistogramMatched(model) ? PER_TEN_THOUSAND : undefined
    return [
        ...PLANET_MOSAIC_SPECTRAL_BANDS.map(name => scalar(name, spectralEncoding)),
        ...PLANET_MOSAIC_INDEXES.map(name => scalar(name, PER_TEN_THOUSAND))
    ]
}

export default defineRecipeType({
    type: 'PLANET_MOSAIC',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...fromSourceAssets(model)
    ],
    imageOutput: imageOutputProvider({
        describe: ({recipe}) => ({bands: planetMosaicBands(recipe.model), evidence: []})
    })
})

// Only the Daily branch is matched; a basemap keeps whatever histogram matching its model states.
const isHistogramMatched = model =>
    model?.sources?.source === 'DAILY' && model?.options?.histogramMatching === 'ENABLED'

function scalar(name, encoding) {
    return {name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'mean', ...(encoding && {encoding})}
}
