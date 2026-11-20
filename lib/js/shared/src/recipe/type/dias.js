import {dataSetPeriodRequirement, periodOfDates} from '../dataSetAvailability.js'
import {defineRecipeType} from '../defineRecipeType.js'
import {imageOutputProvider} from '../output/provider.js'
import {IMAGE_OUTPUT, REFERENCE} from '../output/readiness.js'
import {AOI, fromAoi} from '../source/aoi.js'
import {fromSourceAssets, SOURCE_IMAGERY} from '../source/collectionSources.js'
import {fromSelection} from '../source/extract.js'

// DIAS confirms deforestation alerts from a disturbance index computed over several sensors, inside a forest mask
// (lib/js/ee/src/dias/dias.js). The mask is selected in the options as {type, id}; a HANSEN mask is built from the
// global Hansen asset the implementation names itself, and NONE counts every pixel as forest, so neither is a selected
// source. A Planet collection asset is read only while Planet is among the data sets; Sources drop the asset when
// Planet is removed.

export const FOREST_MASK = 'FOREST_MASK'

const SELECTED_FOREST_MASKS = ['ASSET', 'RECIPE_REF']

// The days every sensor's collection is filtered to, Landsat and Sentinel-2 read as surface reflectance
// (lib/js/ee/src/dias/diCollection.js).
export const dataSetPeriod = model =>
    periodOfDates(model?.dates?.startDate, model?.dates?.endDate, {reflectance: 'SR'})

// In the order lib/js/ee/src/dias/dias.js assembles them. Every band is exported by sample. No encoding is declared.
export const DIAS_BANDS = [
    'forest_mask', 'first_sensor', 'first_date', 'confirming_sensor', 'confirming_date'
].map(name => ({name, dataType: {arrayDimensions: 0}, pyramidingPolicy: 'sample'}))

export default defineRecipeType({
    type: 'DIAS',
    directSources: model => [
        ...fromAoi({model, keys: ['aoi']}),
        ...(SELECTED_FOREST_MASKS.includes(model?.diasOptions?.forestMask?.type)
            ? fromSelection({model, keys: ['diasOptions', 'forestMask'], role: FOREST_MASK})
            : []),
        ...(model?.sources?.dataSets?.PLANET?.length ? fromSourceAssets(model) : [])
    ],
    // The forest mask's image is built and masks every sensor (lib/js/ee/src/dias/dias.js).
    executionNeeds: {[IMAGE_OUTPUT]: {[AOI]: REFERENCE, [FOREST_MASK]: IMAGE_OUTPUT, [SOURCE_IMAGERY]: REFERENCE}},
    configurationRequirements: [
        dataSetPeriodRequirement({period: dataSetPeriod, operations: [IMAGE_OUTPUT]})
    ],
    imageOutput: imageOutputProvider({
        describe: () => ({bands: DIAS_BANDS, evidence: []})
    })
})
