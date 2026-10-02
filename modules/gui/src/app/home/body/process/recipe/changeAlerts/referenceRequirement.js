import {COLLECTION_MOSAIC, PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'

import {IMAGE_OUTPUT} from '../recipeOutput'
import {SLICEABLE_MEASURE_SEGMENTS} from '../segmentRequirements'
import {PIXEL_SEGMENTS} from '../sourceRequirements'

// The reference Change Alerts monitors against must supply segments its alert detection can slice at a date and
// evaluate the monitored band from: the alerts and the segment chart read them. It is selected in REF. The monitoring
// and calibration mosaics are built around the geometry of the reference's segment source, so they need only the
// provider chain that resolves it.
export const referenceRequirement = {
    role: PRIMARY_IMAGE,
    section: {id: 'reference', label: 'process.changeAlerts.panel.reference.button'},
    requirement: SLICEABLE_MEASURE_SEGMENTS,
    parameters: recipe => ({monitoredMeasure: recipe.model.sources?.band || null}),
    operations: [IMAGE_OUTPUT, PIXEL_SEGMENTS],
    providerOperations: [COLLECTION_MOSAIC]
}
