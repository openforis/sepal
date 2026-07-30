import {SAMPLING_GRID_CRS_DEFINITIONS} from '#sepal/recipe/samplingDesign/samplingGridCrs'
import {msg} from '~/translate'

// One ordered option list for both the Stratification and Sample Arrangement grid selectors, built from the
// shared catalog so the two panels can never drift. The option value is the stored id; the WKT never appears.
export const samplingGridCrsOptions = () =>
    SAMPLING_GRID_CRS_DEFINITIONS.map(({id, labelKey}) => ({
        value: id,
        label: msg(labelKey)
    }))
