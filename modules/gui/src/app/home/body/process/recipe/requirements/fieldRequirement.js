import {msg} from '~/translate'

import {IMAGE_OUTPUT} from '../outputs/recipeOutput'

// A requirement over a recipe's configuration that its output read judges (sourceRequirements.js), said at one field of
// its model: the read's findings of `code` located at `path` are that field's, held against the output's operations,
// and `message(diagnostic, presented)` says them - on the section's toolbar button, in its summary, and, where `editor`
// binds the field, beside it in the section's panel (recipeFormPanel.jsx), whose candidate is judged before Apply.
// `presentation(diagnostic, recipe)`, where given, is what the message needs to name what the finding is about, taken from
// the recipe judged - the applied one, or the candidate - and kept with the finding (`presented`): the message resolves
// names from it each time it is said, so they follow the session. `editor` is as recipeFormPanel reads it beyond its
// panel and its message: the input, the candidate and any policy of its own.
export const fieldRequirement = ({id, section, code, path, message, presentation, editor}) => ({
    id,
    section,
    requirement: {id, describe: ({diagnostics, item}) => ({message: message(diagnostics[0], item?.presented), details: []})},
    summary: reads => {
        const {diagnostics, item} = reads[0].verdict.diagnostic
        return message(diagnostics[0], item?.presented)
    },
    outputDiagnostics: {
        codes: [code],
        itemOf: (diagnostic, recipe) => samePath(diagnostic.path, path)
            ? {id, path, label: msg(section.label), ...presentation && {presented: presentation(diagnostic, recipe)}}
            : null
    },
    ...editor && {
        editor: {
            panel: section.id,
            describe: (diagnostics, _values, item) => message(diagnostics[0], item?.presented),
            ...editor
        }
    },
    operations: [IMAGE_OUTPUT]
})

// The same for a field of Sources, bound in the Sources panel, whose values are the recipe's `model.sources`.
export const sourcesFieldRequirement = ({field, editor, ...declaration}) => fieldRequirement({
    ...declaration,
    path: ['model', 'sources', field],
    editor: {
        input: () => field,
        candidate: (recipe, sources) => ({...recipe, model: {...recipe.model, sources}}),
        ...editor
    }
})

// The first few of what a finding names, and how many more there are, as `andMore` says that.
export const listed = (items = [], andMore) => items.length > REPRESENTATIVE
    ? msg(andMore, {items: items.slice(0, REPRESENTATIVE).join(', '), count: items.length - REPRESENTATIVE})
    : items.join(', ')

const REPRESENTATIVE = 3

const samePath = (path = [], expected) => path.length === expected.length && path.every((step, i) => step === expected[i])
