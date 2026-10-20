import {msg} from '~/translate'

// Presentation of confirmed upstream readiness findings at the selections that declare those dependencies.
// No operations: the existing output read still decides gates. Callers may bind this explanation to an editor
// without using it to change draft validity.
export const referenceFeedback = ({section, roles, itemOf}) => ({
    id: `${section.id}.referencedRecipes`,
    section,
    requirement: {
        id: `${section.id}.referencedRecipes`,
        describe: ({item: {referenceFeedback}}) => ({message: message(referenceFeedback), details: [], referenceFeedback})
    },
    summary: reads => reads.map(({ownVerdict}) => message(ownVerdict.diagnostic.item.referenceFeedback)).join(' '),
    outputDiagnostics: {
        codes: [],
        upstreamReferences: roles,
        itemOf: (diagnostic, recipe, context) => {
            const item = itemOf(diagnostic, recipe, context)
            const named = id => ({id, name: context.recipeNames[id] || id})
            return item && {
                ...item,
                referenceFeedback: {
                    reference: named(diagnostic.reference.id),
                    origins: diagnostic.origins.map(named)
                }
            }
        }
    },
    operations: []
})

// Keep identity separate from prose: same-named recipes remain distinct, and future navigation needs no text parsing.
const message = ({reference, origins}) => {
    // Origins are already deduplicated by ID by the bridge. Partition only the wording, keeping metadata intact.
    const upstream = origins.filter(({id}) => id !== reference.id)
    const ownProblem = origins.some(({id}) => id === reference.id)
    if (!upstream.length) {
        return msg('process.source.status.recipeNeedsAttention', {recipe: reference.name})
    }
    const template = ownProblem
        ? upstream.length === 1 ? 'recipeAlsoDependsOn' : 'recipeAlsoDependsOnOrigins'
        : upstream.length === 1 ? 'recipeBlockedBy' : 'recipeBlockedByOrigins'
    return msg(`process.source.status.${template}`, {
        recipe: reference.name,
        origins: upstream.map(({name}) => name).join(', ')
    })
}
