import {MISSING_ROLE, NO_CHANGE_CLASSES, UNAVAILABLE_GATE_INDEX, UNSUPPLIED_CLASSIFIER_INPUTS} from '#sepal/recipe/output/diagnostic'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What PyEO Alerts needs of its Sources and of its index gate, as its shared definition finds it
// (lib/js/shared/src/recipe/type/pyeoAlerts.js): a classification selected, classes to detect change from and to,
// monitoring data that can feed the classification's classifier, and an index the gate can read of both. Its output read
// judges that (sourceRequirements.js), so the toolbar button of the section each concerns and the operations over the
// output say what that read establishes, and so does Sources' editor, beside the field each concerns.
//
// What Sources leaves unchosen waits while the set-up wizard has it open as its step, and the class fields' own rules
// already hold Apply, a class list the draft emptied saying it only once the field says its own error
// (`quietWhileEdited`). What a chosen classification or data set cannot do is said at once. OPT's own panel says what
// its draft's index cannot be computed from; its toolbar button says what the applied gate's cannot.

const SOURCES = {id: 'sources', label: 'process.pyeoAlerts.panel.sources.button'}
const OPTIONS = {id: 'pyeoAlertsOptions', label: 'process.pyeoAlerts.panel.options.button'}

const SOURCES_PATH = ['model', 'sources']
const GATE_INDEX_PATH = ['model', 'pyeoAlertsOptions', 'indexGate', 'index']

const required = field => () => msg(`process.pyeoAlerts.panel.sources.form.${field}.required`)

const unsupplied = field => ({missing}) =>
    msg(`process.pyeoAlerts.panel.sources.form.${field}.unsuppliedInputs`, {missing: listed(missing)})

const unavailableIndex = ({index, source}) =>
    msg(`process.pyeoAlerts.panel.options.form.gateIndex.unavailable.${source}`, {index: index.toUpperCase()})

const declaration = ({id, section, code, path, message, editor}) => ({
    id,
    section,
    requirement: {id, describe: ({diagnostics}) => ({message: message(diagnostics[0]), details: []})},
    summary: reads => message(reads.flatMap(({verdict}) => verdict.diagnostic.diagnostics)[0]),
    outputDiagnostics: {
        codes: [code],
        itemOf: diagnostic => samePath(diagnostic.path, path)
            ? {id, path, label: msg(section.label)}
            : null
    },
    ...editor && {
        editor: {
            panel: section.id,
            describe: diagnostics => message(diagnostics[0]),
            candidate: (recipe, sources) => ({...recipe, model: {...recipe.model, sources}}),
            ...editor
        }
    },
    operations: [IMAGE_OUTPUT]
})

const sourcesField = (field, code, message, editor = {}) => declaration({
    id: `sources.${field}.${code}`,
    section: SOURCES,
    code,
    path: [...SOURCES_PATH, field],
    message,
    editor: {input: () => field, ...editor}
})

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
    declaration({id: 'options.gateIndex', section: OPTIONS, code: UNAVAILABLE_GATE_INDEX, path: GATE_INDEX_PATH, message: unavailableIndex})
]

const samePath = (path = [], expected) => path.length === expected.length && path.every((step, i) => step === expected[i])

const REPRESENTATIVE = 3

const listed = (items = []) => items.length > REPRESENTATIVE
    ? msg('process.pyeoAlerts.panel.sources.form.andMore', {items: items.slice(0, REPRESENTATIVE).join(', '), count: items.length - REPRESENTATIVE})
    : items.join(', ')
