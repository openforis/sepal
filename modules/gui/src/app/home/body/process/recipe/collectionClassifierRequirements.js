import {UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What CCDC, Time Series and Phenology need of the Classification their Sources may select, as their shared definitions
// find it (collectionClassifierRequirement, lib/js/shared/src/recipe/source/collectionSources.js): that the images of
// the collection they configure carry what its classifier reads. Their output read judges that (sourceRequirements.js),
// so Sources' toolbar button and the operations over the output say what that read establishes, and so does the Sources
// editor beside the data sets, where another collection would carry it, or else the classification - said at once, for
// it concerns a choice made. A draft refused for it cannot be applied. `sources` is the recipe's Sources section.

export const collectionClassifierRequirements = sources => ['classification', 'dataSets'].map(field => {
    const path = ['model', 'sources', field]
    const message = ({missing} = {}) => msg(`process.source.classifierInputs.${field}`, {missing: listed(missing)})
    return {
        id: `sources.${field}.classifierInputs`,
        section: sources,
        requirement: {id: `sources.${field}.classifierInputs`, describe: ({diagnostics}) => ({message: message(diagnostics[0]), details: []})},
        summary: reads => message(reads.flatMap(({verdict}) => verdict.diagnostic.diagnostics)[0]),
        outputDiagnostics: {
            codes: [UNSUPPLIED_CLASSIFIER_INPUTS],
            itemOf: diagnostic => samePath(diagnostic.path, path)
                ? {id: field, path, label: msg(sources.label)}
                : null
        },
        editor: {
            panel: sources.id,
            input: () => field,
            describe: diagnostics => message(diagnostics[0]),
            candidate: (recipe, model) => ({...recipe, model: {...recipe.model, sources: model}})
        },
        operations: [IMAGE_OUTPUT]
    }
})

const samePath = (path = [], expected) => path.length === expected.length && path.every((step, i) => step === expected[i])

const REPRESENTATIVE = 3

const listed = (items = []) => items.length > REPRESENTATIVE
    ? msg('process.source.segments.andMore', {items: items.slice(0, REPRESENTATIVE).join(', '), count: items.length - REPRESENTATIVE})
    : items.join(', ')
