import {COLLECTION_MOSAIC, PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'

import {IMAGE_OUTPUT} from '../recipeOutput'
import {CHARTABLE_SEGMENTS, MONITORED_MEASURE, SLICEABLE_SEGMENTS} from '../segmentRequirements'
import {PIXEL_SEGMENTS} from '../sourceRequirements'
import {availableMeasures, monitorableMeasures, observedMeasures} from './monitoringData'

// What Change Alerts needs of the reference it monitors against, selected in REF, by what reads it. The alerts and
// their Retrieve slice its segments (lib/js/ee/src/timeSeries/changeAlertsAlgorithm.js) for the measure chosen in
// Sources, and observe it in the monitoring data chosen there; the monitoring and calibration mosaics are built around
// the geometry of its segment source, so they need only the provider chain that resolves it; the segment chart plots
// more of each segment than the alerts read. The chart's needs gate the chart and are reported in REF, but do not
// refuse a reference the alerts can use.
//
// A reference with no measure any monitoring data Sources offers observes is refused in REF; one whose measures only
// other monitoring settings observe is accepted, and Sources is what then needs changing.

// REF says what it finds on the input the reference is selected in. Sources' choices cannot show it, so its toolbar
// button does.
const REFERENCE = {
    id: 'reference',
    label: 'process.changeAlerts.panel.reference.button',
    input: ({section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset'
}
const SOURCES = {id: 'sources', label: 'process.changeAlerts.panel.sources.button'}

export const referenceRequirements = [
    {
        role: PRIMARY_IMAGE,
        section: REFERENCE,
        requirement: SLICEABLE_SEGMENTS,
        operations: [IMAGE_OUTPUT],
        providerOperations: [COLLECTION_MOSAIC]
    },
    {
        role: PRIMARY_IMAGE,
        section: REFERENCE,
        requirement: MONITORED_MEASURE,
        parameters: () => ({monitorable: monitorableMeasures()}),
        operations: [IMAGE_OUTPUT]
    },
    {
        role: PRIMARY_IMAGE,
        section: SOURCES,
        requirement: MONITORED_MEASURE,
        parameters: ({model}) => ({
            measure: model.sources?.band || null,
            available: availableMeasures(model.sources?.dataSetType),
            observed: observedMeasures(model)
        }),
        operations: [IMAGE_OUTPUT],
        advise: [REFERENCE.id]
    },
    {
        role: PRIMARY_IMAGE,
        section: REFERENCE,
        requirement: CHARTABLE_SEGMENTS,
        operations: [PIXEL_SEGMENTS],
        requiredForSelection: false
    }
]
