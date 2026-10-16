import {msg} from '~/translate'

// Presentation of confirmed upstream readiness findings at the selections that declare those dependencies.
// No operations or editor binding: the existing output read still decides gates, acquisition and draft validity.
export const referenceFeedback = ({section, roles, itemOf}) => ({
    id: `${section.id}.referencedRecipes`,
    section,
    requirement: {
        id: `${section.id}.referencedRecipes`,
        describe: ({item}) => ({message: message([item]), details: []})
    },
    summary: reads => message(reads.map(({item}) => item)),
    outputDiagnostics: {codes: [], upstreamReferences: roles, itemOf},
    operations: []
})

const message = items => {
    const names = [...new Set(items.map(({label}) => label))]
    return msg(`process.source.status.${names.length === 1 ? 'recipeNeedsAttention' : 'recipesNeedAttention'}`, {
        recipe: names.join(', ')
    })
}
