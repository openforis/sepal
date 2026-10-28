import {UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/classifierInputs'
import {MISSING_ROLE} from '#sepal/recipe/output/diagnostic'
import {MULTIPLE_CLASSIFICATION_INPUTS, NO_CHANGE_CLASSES, UNAVAILABLE_GATE_INDEX} from '#sepal/recipe/type/pyeoAlerts'
import {msg} from '~/translate'

import {classificationReferenceFeedback} from '../collectionClassifierRequirements'
import {fieldRequirement, listed, sourcesFieldRequirement} from '../fieldRequirement'
import {CHECKING, UNAVAILABLE} from '../sourceRequirements'

// What PyEO Alerts needs of its Sources and of its index gate, as its shared definition finds it
// (lib/js/shared/src/recipe/type/pyeoAlerts.js): a classification selected, classes to detect change from and to,
// a classification of one input image, monitoring data that can feed its classifier, and an index the gate can read of
// both. Its output read
// judges that (sourceRequirements.js), so the toolbar button of the section each concerns and the operations over the
// output say what that read establishes, and so do Sources' and OPT's editors, beside the field each concerns. A
// classification that cannot itself run - its baseline is that recipe's image - is named beside the field, whose own
// sections say why.
//
// What Sources leaves unchosen waits while the set-up wizard has it open as its step, and the class fields' own rules
// already hold Apply, a class list the draft emptied saying it only once the field says its own error
// (`quietWhileEdited`). What a chosen classification or data set cannot do is said at once. The gate is judged only over
// a classification of one input the monitoring data can feed: OPT's gate settings wait on that (gateDependencyOf), and
// what its index cannot be read of is OPT's to repair - another index, or no gate.

const SOURCES = {id: 'sources', label: 'process.pyeoAlerts.panel.sources.button'}
const OPTIONS = {id: 'pyeoAlertsOptions', label: 'process.pyeoAlerts.panel.options.button'}

const GATE_INDEX_PATH = ['model', 'pyeoAlertsOptions', 'indexGate', 'index']

// The classification found unusable: more than one input image, or one the monitoring data cannot feed its classifier.
export const INCOMPATIBLE = 'INCOMPATIBLE'

const required = field => () => msg(`process.pyeoAlerts.panel.sources.form.${field}.required`)

const multipleInputs = ({count}) => msg('process.pyeoAlerts.panel.sources.form.classification.multipleInputs', {count})

const unsupplied = field => ({missing}) =>
    msg(`process.pyeoAlerts.panel.sources.form.${field}.unsuppliedInputs`, {missing: listed(missing, AND_MORE)})

// Where no other index can be read either, only turning the gate off repairs it.
const unavailableIndex = ({index, source, alternatives}) =>
    msg(`process.pyeoAlerts.panel.options.form.gateIndex.${alternatives?.length ? 'unavailable' : 'noAlternative'}.${source}`, {
        index: index.toUpperCase()
    })

const sourcesField = (field, code, message, editor) =>
    sourcesFieldRequirement({id: `sources.${field}.${code}`, section: SOURCES, field, code, message, editor})

// OPT's index, judged by its editor over the draft, and by each index the gate offers (gateIndexCandidates.js).
export const GATE_INDEX_REQUIREMENT = fieldRequirement({
    id: 'options.gateIndex',
    section: OPTIONS,
    code: UNAVAILABLE_GATE_INDEX,
    path: GATE_INDEX_PATH,
    message: unavailableIndex,
    editor: {
        input: 'gateIndex',
        candidate: (recipe, pyeoAlertsOptions) => ({...recipe, model: {...recipe.model, pyeoAlertsOptions}})
    }
})

const GATE_PREREQUISITES = [
    sourcesField('classification', MULTIPLE_CLASSIFICATION_INPUTS, multipleInputs),
    sourcesField('classification', UNSUPPLIED_CLASSIFIER_INPUTS, unsupplied('classification')),
    sourcesField('dataSets', UNSUPPLIED_CLASSIFIER_INPUTS, unsupplied('dataSets'))
]

export const sourcesRequirements = [
    {...sourcesField('classification', MISSING_ROLE, required('classification')), wizardStepMark: false},
    // The Sources form's changeFromClasses/changeToClasses .notEmpty() rules already block submission. These
    // declarations repeat that feedback with the agreed interaction timing; they need no second blocking predicate.
    {
        ...sourcesField('changeFromClasses', NO_CHANGE_CLASSES, required('changeFromClasses'), {blocksApply: false, quietWhileEdited: true}),
        wizardStepMark: false
    },
    {
        ...sourcesField('changeToClasses', NO_CHANGE_CLASSES, required('changeToClasses'), {blocksApply: false, quietWhileEdited: true}),
        wizardStepMark: false
    },
    ...GATE_PREREQUISITES,
    GATE_INDEX_REQUIREMENT,
    classificationReferenceFeedback(SOURCES)
]

// What the gate's settings wait on, of the recipe's output requirement reads (sourceRequirements.js): INCOMPATIBLE where
// the classification is found to have more than one input, or the monitoring data unable to feed its classifier,
// CHECKING or UNAVAILABLE while the read that would find it is that, and null otherwise - nothing found against it, or
// it refused for something else.
export const gateDependencyOf = reads => {
    const own = reads.filter(({declaration}) => GATE_PREREQUISITES.includes(declaration))
    if (own.some(({item}) => item)) {
        return INCOMPATIBLE
    }
    return own.find(({outputState, acquisition}) => outputState && [CHECKING, UNAVAILABLE].includes(acquisition))?.acquisition || null
}

const AND_MORE = 'process.pyeoAlerts.panel.sources.form.andMore'
