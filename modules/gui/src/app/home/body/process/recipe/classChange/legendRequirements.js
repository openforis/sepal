import {MISSING_LEGEND} from '#sepal/recipe/type/classChange'
import {IMAGE_OUTPUT} from '~/app/home/body/process/recipe/recipeOutput'
import {msg} from '~/translate'

// What Class Change needs of each image's legend, as its shared definition finds it (lib/js/shared/src/recipe/type/
// classChange.js): one with entries, since execution codes transitions from them. Its output read judges that
// (sourceRequirements.js), so the image's section and the operations over the output say what that read establishes, and
// so does the image's editor, beside its legend: at once for a legend saved without entries, and for one the draft has
// changed only once the legend says its own error (`quietWhileEdited`). The legend's own rule already holds Apply. While
// the set-up wizard has the image open as its step, neither its toolbar button nor an untouched legend says it yet.
//
// `images` are [{section, key}]: the section editing each image and the model key it is kept under.

export const legendRequirements = images => images.map(({section, key}) => ({
    id: `${key}.legend`,
    section,
    requirement: {id: `${key}.legend`, describe: () => ({message: sectionMessage(), details: []})},
    summary: () => sectionMessage(),
    outputDiagnostics: {
        codes: [MISSING_LEGEND],
        itemOf: ({path}) => path?.[1] === key ? {id: key, path: ['model', key], label: msg(section.label)} : null
    },
    wizardStepMark: false,
    editor: {
        panel: section.id,
        input: () => 'legendEntries',
        describe: () => msg('process.classChange.panel.inputImage.legend.required'),
        blocksApply: false,
        quietWhileEdited: true,
        candidate: (recipe, model) => ({...recipe, model: {...recipe.model, [key]: model}})
    },
    operations: [IMAGE_OUTPUT]
}))

const sectionMessage = () => msg('process.classChange.panel.inputImage.legend.missing')
