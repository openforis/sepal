import {UNSUPPORTED_CLASSIFIED_OUTPUT} from '#sepal/recipe/classifiedOutputs'
import {UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/classifierInputs'
import {msg} from '~/translate'

import {listed, sourcesFieldRequirement} from './fieldRequirement'

// What CCDC, Time Series and Phenology need of the Classification their Sources may select, as their shared definitions
// find it (collectionClassifierRequirement, lib/js/shared/src/recipe/source/collectionSources.js): that the images of
// the collection they configure carry what its classifier reads. Their output read judges that (sourceRequirements.js),
// so Sources' toolbar button and the operations over the output say what that read establishes, and so does the Sources
// editor beside the data sets, where another collection would carry it, or else the classification - said at once, for
// it concerns a choice made. A draft refused for it cannot be applied. `sources` is the recipe's Sources section.
export const collectionClassifierRequirements = sources => ['classification', 'dataSets'].map(field =>
    sourcesFieldRequirement({
        id: `sources.${field}.classifierInputs`,
        section: sources,
        field,
        code: UNSUPPLIED_CLASSIFIER_INPUTS,
        message: ({missing} = {}) => msg(`process.source.classifierInputs.${field}`, {missing: listed(missing, AND_MORE)})
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

const AND_MORE = 'process.source.segments.andMore'
