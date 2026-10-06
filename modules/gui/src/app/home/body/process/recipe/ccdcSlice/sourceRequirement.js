import {PRIMARY_IMAGE} from '#sepal/recipe/type/ccdcSlice'

import {IMAGE_OUTPUT} from '../recipeOutput'
import {CHARTABLE_SEGMENTS, SLICE_SOURCE_SEGMENTS} from '../segmentRequirements'
import {PIXEL_SEGMENTS} from '../sourceRequirements'

// What CCDC Slice needs of the segments it slices, selected in SRC, by what reads them. The slice and its Retrieve read
// every band of the source's segments (lib/js/ee/src/timeSeries/ccdcSlice.js), so a source they cannot slice is refused
// in SRC. The segment chart reads the segment bands and the one measure it plots, so it can chart a source the slice
// cannot use; what it needs gates the chart and is reported in SRC, but refuses nothing.

// SRC says what it finds on the input the source is selected in.
const SOURCE = {
    id: 'source',
    label: 'process.ccdcSlice.panel.source.button',
    input: ({section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset'
}

export const sliceRequirements = [
    {
        role: PRIMARY_IMAGE,
        section: SOURCE,
        requirement: SLICE_SOURCE_SEGMENTS,
        operations: [IMAGE_OUTPUT]
    },
    {
        role: PRIMARY_IMAGE,
        section: SOURCE,
        requirement: CHARTABLE_SEGMENTS,
        operations: [PIXEL_SEGMENTS],
        requiredForSelection: false
    }
]
