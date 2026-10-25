import {UNSUPPORTED_CLASSIFIED_OUTPUT} from '#sepal/recipe/classifiedOutputs'
import {UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/classifierInputs'
import {CLASSIFICATION_SOURCE} from '#sepal/recipe/source/collectionSources'
import {msg} from '~/translate'

import {listed, sourcesFieldRequirement} from './fieldRequirement'
import {referenceFeedback} from './referenceFeedback'

// What CCDC, Time Series and Phenology need of the Classification their Sources may select, as their shared definitions
// find it (collectionClassifierRequirement, lib/js/shared/src/recipe/source/collectionSources.js): that the images of
// the collection they configure carry what its classifier reads. Their output read judges that (sourceRequirements.js),
// so Sources' toolbar button and the operations over the output say what that read establishes, and so does the Sources
// editor - said at once, for it concerns a choice made. The finding is located at the data sets where another collection
// would carry it, or else at the classification, and its message says which repairs it; either way it is said beside the
// classification, the dependency whose bands are missing, which Sources show while it cannot be used. A draft refused for
// it cannot be applied. `sources` is the recipe's Sources section.
export const collectionClassifierRequirements = sources => ['classification', 'dataSets'].map(field =>
    sourcesFieldRequirement({
        id: `sources.${field}.classifierInputs`,
        section: sources,
        field,
        code: UNSUPPLIED_CLASSIFIER_INPUTS,
        message: ({missing} = {}) => msg(`process.source.classifierInputs.${field}`, {missing: listed(missing, AND_MORE)}),
        editor: {input: () => 'classification'}
    })
)

// What a recipe whose Sources choose classified outputs at `field` - CCDC's breakpoint bands, Phenology's band - needs of
// the Classification they select, as its shared definition finds it (classifiedOutputRequirement,
// lib/js/shared/src/recipe/classifiedOutputs.js): that it provides them, by what its classifier's configuration supports.
// Said at that field, which is what chooses them, and a draft choosing one it does not provide cannot be applied.
export const classifiedOutputRequirements = (sources, field) => sourcesFieldRequirement({
    id: `sources.${field}.classifiedOutputs`,
    section: sources,
    field,
    code: UNSUPPORTED_CLASSIFIED_OUTPUT,
    message: ({unsupported} = {}) => msg(`process.source.classifiedOutputs.${field}`, {unsupported: listed(unsupported, AND_MORE)})
})

// The Classification a recipe's Sources select, where what the recipe does with it needs that Classification to run
// (lib/js/shared/src/recipe/type/pyeoAlerts.js, phenology.js, ccdc.js, timeSeries.js) - for Time Series and CCDC, trained,
// whatever bands are asked: its readiness findings, which stay that recipe's, are named beside the classification field,
// whose own sections say why, and mark Sources. Presentation alone: the output read holds the
// operations, and a draft is not held back for it.
export const classificationReferenceFeedback = sources => ({
    ...referenceFeedback({
        section: sources,
        roles: [CLASSIFICATION_SOURCE],
        itemOf: () => ({id: `${sources.id}.classification`, path: CLASSIFICATION_PATH, label: msg(sources.label)})
    }),
    editor: {
        panel: sources.id,
        input: 'classification',
        blocksApply: false,
        explain: true,
        candidate: (recipe, values) => ({...recipe, model: {...recipe.model, sources: values}})
    }
})

const CLASSIFICATION_PATH = ['model', 'sources', 'classification']

const AND_MORE = 'process.source.segments.andMore'
