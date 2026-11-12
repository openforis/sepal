import {UNREADABLE_PROCESSING} from '#sepal/recipe/changeAlerts/processing'
import {PIXEL_OBSERVATIONS} from '#sepal/recipe/output/readiness'
import {
    MONITORED_MEASURE_ABSENT,
    MONITORED_MEASURE_UNOBSERVED,
    NO_AVAILABLE_MEASURE,
    NO_OBSERVED_MEASURE
} from '#sepal/recipe/requirement/ccdcSegments'
import {REFERENCE_DATE_FORMAT_REQUIRED} from '#sepal/recipe/requirement/changeAlertsProcessing'
import {COLLECTION_MOSAIC, PRIMARY_IMAGE} from '#sepal/recipe/type/changeAlerts'
import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../outputs/recipeOutput'
import {fieldRequirement} from '../requirements/fieldRequirement'
import {referenceFeedback} from '../requirements/referenceFeedback'
import {PIXEL_SEGMENTS} from '../requirements/sourceRequirements'
import {CHARTABLE_SEGMENTS, MONITORED_MEASURE, SLICEABLE_SEGMENTS} from '../sources/segmentRequirements'
import {availableMeasures, monitorableMeasures, observedMeasures} from './monitoringData'
import {settingsOf} from './processingSettings'

// What Change Alerts needs of the reference it monitors against, selected in REF, by what reads it. The alerts and
// their Retrieve slice its segments (lib/js/ee/src/timeSeries/changeAlertsAlgorithm.js) for the measure chosen in
// Sources, and observe it in the monitoring data chosen there. The monitoring and calibration mosaics are built around
// the geometry of its segment source, so they need the provider chain that resolves it; they show the imagery the
// alerts monitor, so they are held for the measure Sources monitor as the alerts are, but not for the layout the alerts
// slice. The segment chart plots more of each segment than the alerts read. The chart's needs gate the chart and are
// reported in REF, but do not refuse a reference the alerts can use.
//
// A reference with no measure any monitoring data Sources offers observes is refused in REF; one whose measures only
// other monitoring settings observe is accepted, and Sources is what then needs changing.

// REF says what it finds on the input the reference is selected in. Sources says it on the setting it asks to change -
// the type of data, its data sets, or the band monitored - and on its toolbar button. What concerns none of them, such
// as a reference that supplies no segments, is REF's to repair: Sources says it on its button alone. A reference Sources
// no longer suits is not warned of in REF: a reference deliberately replaced is followed by Sources' own validation.
const REFERENCE = {
    id: 'reference',
    label: 'process.changeAlerts.panel.reference.button',
    input: ({section}) => section === 'RECIPE_REF' ? 'recipe' : 'asset'
}
export const SOURCES = {
    id: 'sources',
    label: 'process.changeAlerts.panel.sources.button',
    input: (_values, refusal) => SOURCES_INPUTS[refusal?.code] || null
}

const SOURCES_INPUTS = {
    [NO_AVAILABLE_MEASURE]: 'dataSetType',
    [NO_OBSERVED_MEASURE]: 'dataSets',
    [MONITORED_MEASURE_ABSENT]: 'band',
    [MONITORED_MEASURE_UNOBSERVED]: 'band'
}

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
        parameters: recipe => ({
            measure: recipe.model.sources?.band || null,
            available: availableMeasures(recipe.model.sources?.dataSetType),
            observed: settingsOf(recipe).model ? observedMeasures(settingsOf(recipe).model) : null
        }),
        operations: [IMAGE_OUTPUT, COLLECTION_MOSAIC, PIXEL_SEGMENTS, PIXEL_OBSERVATIONS]
    },
    {
        role: PRIMARY_IMAGE,
        section: REFERENCE,
        requirement: CHARTABLE_SEGMENTS,
        operations: [PIXEL_SEGMENTS],
        requiredForSelection: false
    },
    // The processing the reference records, as the alerts' readiness judges it (type/changeAlerts.js), wherever that
    // holds them, through the alerts or a recipe whose image they are. Said at the reference - beside its date
    // representation where that is what is missing - and judged for a selection before it is applied, over the alerts it
    // would leave: only what this finds holds it back. Waiting, or refused for anything else, is said where that lies.
    {
        ...fieldRequirement({
            id: 'reference.processing',
            section: REFERENCE,
            codes: [UNREADABLE_PROCESSING, REFERENCE_DATE_FORMAT_REQUIRED],
            path: ['model', 'reference'],
            message: ({code}) => msg(code === REFERENCE_DATE_FORMAT_REQUIRED
                ? 'process.changeAlerts.processing.dateFormatRequired' : 'process.changeAlerts.processing.unreadable'),
            editor: {
                input: (diagnostic, values) => diagnostic.code === REFERENCE_DATE_FORMAT_REQUIRED ? 'dateFormat' : REFERENCE.input(values),
                candidate: (recipe, reference) => ({...recipe, model: {...recipe.model, reference}})
            }
        }),
        outputState: false
    },
    {
        ...referenceFeedback({
            section: REFERENCE,
            roles: [PRIMARY_IMAGE],
            itemOf: () => ({id: 'reference', path: ['model', 'reference'], label: msg(REFERENCE.label)})
        }),
        editor: {
            panel: REFERENCE.id,
            input: 'recipe',
            explain: true,
            candidate: (recipe, reference) => ({...recipe, model: {...recipe.model, reference}})
        }
    }
]
