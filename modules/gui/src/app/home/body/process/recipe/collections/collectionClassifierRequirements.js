import {UNSUPPORTED_CLASSIFIED_OUTPUT} from '#sepal/recipe/classifiedOutputs'
import {UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/classifierInputs'
import {CLASSIFICATION_SOURCE} from '#sepal/recipe/source/collectionSources'
import {msg} from '~/translate'

import {classifiedOutputFallbackLabel} from '../classification/bands'
import {listed, sourcesFieldRequirement} from '../requirements/fieldRequirement'
import {referenceFeedback} from '../requirements/referenceFeedback'
import {classificationNaming, classifiedOutputLabel} from './selectedClassification'

// What CCDC, Time Series and Phenology need of the Classification their Sources may select, as their shared definitions
// find it (collectionClassifierRequirement, lib/js/shared/src/recipe/source/collectionSources.js): that the images of
// the collection they configure carry what its classifier reads. Their output read judges that (sourceRequirements.js),
// so Sources' toolbar button and the operations over the output say what that read establishes, and so does the Sources
// editor - said at once, for it concerns a choice made. The finding is located at the data sets where data sets that
// can be chosen would carry it, or else at the classification, and its message says the repair it names
// (classifierInputsMessage); either way it is said beside the classification, the dependency whose bands are missing,
// which Sources show while it cannot be used. A draft refused for it cannot be applied. `sources` is the recipe's
// Sources section.
export const collectionClassifierRequirements = sources => ['classification', 'dataSets'].map(field =>
    sourcesFieldRequirement({
        id: `sources.${field}.classifierInputs`,
        section: sources,
        field,
        code: UNSUPPLIED_CLASSIFIER_INPUTS,
        message: finding => classifierInputsMessage(COLLECTION_CLASSIFIER_INPUT_MESSAGES, finding),
        editor: {input: () => 'classification'}
    })
)

// What a finding of UNSUPPLIED_CLASSIFIER_INPUTS says, by the repair the shared rule names of it
// (unsuppliedClassifierFeatures, lib/js/shared/src/recipe/classifierInputs.js), each a key of `messages`: data sets to
// choose instead (`alternatives`); the correction to turn to, alone (`reflectance`) or with data sets to choose instead
// (`reflectanceAlternatives`), each keyed by that correction; data sets that would, but the years read exclude
// (`unavailable`); or none (`unsupplied`) - and `andMore`, how a long list of missing features ends. The messages only
// say what the finding names, the data sets by their Sources labels.
export const classifierInputsMessage = (messages, {missing, alternatives, reflectance, unavailable, startYear, endYear} = {}) => {
    const values = {missing: listed(missing, messages.andMore)}
    if (alternatives) {
        return msg(messages.alternatives, {...values, alternatives: dataSetLabels(alternatives)})
    }
    if (reflectance?.chosen) {
        return msg(`${messages.reflectance}.${reflectance.to}`, values)
    }
    if (reflectance) {
        return msg(`${messages.reflectanceAlternatives}.${reflectance.to}`, {...values, alternatives: dataSetLabels(reflectance.alternatives)})
    }
    if (unavailable) {
        return msg(messages.unavailable, {...values, unavailable: dataSetLabels(unavailable), years: yearsOf(startYear, endYear)})
    }
    return msg(messages.unsupplied, values)
}

// What a recipe whose Sources choose classified outputs at `field` - CCDC's breakpoint bands, Phenology's band - needs of
// the Classification they select, as its shared definition finds it (classifiedOutputRequirement,
// lib/js/shared/src/recipe/classifiedOutputs.js): that it provides them, by what its classifier's configuration supports.
// Said at that field, which is what chooses them, naming each as its choice is named (classifiedOutputLabel), and a draft
// choosing one it does not provide cannot be applied.
export const classifiedOutputRequirements = (sources, field) => sourcesFieldRequirement({
    id: `sources.${field}.classifiedOutputs`,
    section: sources,
    field,
    code: UNSUPPORTED_CLASSIFIED_OUTPUT,
    presentation: (_diagnostic, recipe) => classificationNaming(recipe),
    message: ({unsupported = []} = {}, naming) => msg(`process.source.classifiedOutputs.${field}`, {
        unsupported: listed(unsupported.map(band => naming ? classifiedOutputLabel(naming, band) : classifiedOutputFallbackLabel(band)), AND_MORE)
    })
})

// The Classification a recipe's Sources select, where what the recipe does with it needs that Classification to run
// (lib/js/shared/src/recipe/type/pyeoAlerts.js, phenology.js, ccdc.js, timeSeries.js) - for Time Series and CCDC, trained,
// whatever bands are asked: its readiness findings, which stay that recipe's, are named beside the classification field,
// whose own sections say why, and mark Sources. The same confirmed finding blocks committing the draft selection;
// its operation scope remains the shared declaration's, including Phenology's native-band alternative.
export const classificationReferenceFeedback = sources => ({
    ...referenceFeedback({
        section: sources,
        roles: [CLASSIFICATION_SOURCE],
        itemOf: () => ({id: `${sources.id}.classification`, path: CLASSIFICATION_PATH, label: msg(sources.label)})
    }),
    editor: {
        panel: sources.id,
        input: 'classification',
        explain: true,
        candidate: (recipe, values) => ({...recipe, model: {...recipe.model, sources: values}})
    }
})

const CLASSIFICATION_PATH = ['model', 'sources', 'classification']

const AND_MORE = 'process.source.segments.andMore'

const COLLECTION_CLASSIFIER_INPUT_MESSAGES = {
    andMore: AND_MORE,
    alternatives: 'process.source.classifierInputs.dataSets',
    reflectance: 'process.source.classifierInputs.reflectance',
    reflectanceAlternatives: 'process.source.classifierInputs.reflectanceDataSets',
    unavailable: 'process.source.classifierInputs.unavailable',
    unsupplied: 'process.source.classifierInputs.classification'
}

// Every one named, for a repair replaces the selection with data sets of these alone.
const dataSetLabels = dataSets => dataSets.map(dataSet => msg(['sources.dataSets', dataSet, 'label'])).join(', ')

const yearsOf = (startYear, endYear) => startYear === endYear ? `${startYear}` : `${startYear}-${endYear}`
