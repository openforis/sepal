import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {fromAoi} from '../source/aoi.js'
import {SOURCE_IMAGERY} from '../source/collectionSources.js'
import {fromId, fromSelection} from '../source/extract.js'
import {assetReference} from '../source/reference.js'

// DIAS confirms deforestation alerts from a disturbance index computed over several sensors, inside a forest mask
// (lib/js/ee/src/dias/dias.js). The mask is selected as {type, id}; a HANSEN mask is built from the global Hansen
// asset the implementation names itself, so it is no selected source. A Planet collection is read only while
// Planet is enabled; the sources panel keeps the asset when Planet is switched off.

export const FOREST_MASK = 'FOREST_MASK'

// In the order lib/js/ee/src/dias/dias.js assembles them. Every band is exported by sample. No encoding is declared.
export const DIAS_BANDS = [
    'forest_mask', 'first_sensor', 'first_ydoy', 'confirming_sensor', 'confirming_ydoy'
].map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

export default defineRecipeType({
    type: 'DIAS',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...(model?.forestMask?.type === 'HANSEN' ? [] : fromSelection({model, keys: ['forestMask'], role: FOREST_MASK})),
        ...(model?.sources?.planet?.enabled
            ? fromId({model, keys: ['sources', 'planet', 'asset'], toReference: assetReference, role: SOURCE_IMAGERY})
            : [])
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: DIAS_BANDS, evidence: []})
    })
})
