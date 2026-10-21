import {UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/classifierInputs'
import {MISSING_ROLE} from '#sepal/recipe/output/diagnostic'
import {CLASSIFICATION_SOURCE, NO_CHANGE_CLASSES, UNAVAILABLE_GATE_INDEX} from '#sepal/recipe/type/pyeoAlerts'
import {msg} from '~/translate'

import {fieldRequirement, listed, sourcesFieldRequirement} from '../fieldRequirement'
import {referenceFeedback} from '../referenceFeedback'

// What PyEO Alerts needs of its Sources and of its index gate, as its shared definition finds it
// (lib/js/shared/src/recipe/type/pyeoAlerts.js): a classification selected, classes to detect change from and to,
// monitoring data that can feed the classification's classifier, and an index the gate can read of both. Its output read
// judges that (sourceRequirements.js), so the toolbar button of the section each concerns and the operations over the
// output say what that read establishes, and so does Sources' editor, beside the field each concerns. A classification
// that cannot itself run - its baseline is that recipe's image - is named beside the field, whose own sections say why.
//
// What Sources leaves unchosen waits while the set-up wizard has it open as its step, and the class fields' own rules
// already hold Apply, a class list the draft emptied saying it only once the field says its own error
// (`quietWhileEdited`). What a chosen classification or data set cannot do is said at once. OPT's own panel says what
// its draft's index cannot be computed from; its toolbar button says what the applied gate's cannot.

const SOURCES = {id: 'sources', label: 'process.pyeoAlerts.panel.sources.button'}
const OPTIONS = {id: 'pyeoAlertsOptions', label: 'process.pyeoAlerts.panel.options.button'}

const GATE_INDEX_PATH = ['model', 'pyeoAlertsOptions', 'indexGate', 'index']
const CLASSIFICATION_PATH = ['model', 'sources', 'classification']

const required = field => () => msg(`process.pyeoAlerts.panel.sources.form.${field}.required`)

const unsupplied = field => ({missing}) =>
    msg(`process.pyeoAlerts.panel.sources.form.${field}.unsuppliedInputs`, {missing: listed(missing, AND_MORE)})

const unavailableIndex = ({index, source}) =>
    msg(`process.pyeoAlerts.panel.options.form.gateIndex.unavailable.${source}`, {index: index.toUpperCase()})

const sourcesField = (field, code, message, editor) =>
    sourcesFieldRequirement({id: `sources.${field}.${code}`, section: SOURCES, field, code, message, editor})

export const sourcesRequirements = [
    {...sourcesField('classification', MISSING_ROLE, required('classification')), wizardStepMark: false},
    {
        ...sourcesField('changeFromClasses', NO_CHANGE_CLASSES, required('changeFromClasses'), {blocksApply: false, quietWhileEdited: true}),
        wizardStepMark: false
    },
    {
        ...sourcesField('changeToClasses', NO_CHANGE_CLASSES, required('changeToClasses'), {blocksApply: false, quietWhileEdited: true}),
        wizardStepMark: false
    },
    sourcesField('classification', UNSUPPLIED_CLASSIFIER_INPUTS, unsupplied('classification')),
    sourcesField('dataSets', UNSUPPLIED_CLASSIFIER_INPUTS, unsupplied('dataSets')),
    fieldRequirement({id: 'options.gateIndex', section: OPTIONS, code: UNAVAILABLE_GATE_INDEX, path: GATE_INDEX_PATH, message: unavailableIndex}),
    {
        ...referenceFeedback({
            section: SOURCES,
            roles: [CLASSIFICATION_SOURCE],
            itemOf: () => ({id: 'sources.classification', path: CLASSIFICATION_PATH, label: msg(SOURCES.label)})
        }),
        editor: {
            panel: SOURCES.id,
            input: 'classification',
            blocksApply: false,
            explain: true,
            candidate: (recipe, sources) => ({...recipe, model: {...recipe.model, sources}})
        }
    }
]

const AND_MORE = 'process.pyeoAlerts.panel.sources.form.andMore'
