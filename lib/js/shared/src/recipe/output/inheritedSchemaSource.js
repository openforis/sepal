// Which source a recipe inherits its current band schema and values from.
//
// One question, asked of one recipe: the declaration says whether this output preserves an input's schema
// and values, and the recipe's own direct edges say which source fills that role. Nothing descends, so this
// is not traversal and cannot become a second graph - a consumer that needs the whole closure already has
// the resolver for it. What this exists for is the consumer that has the source record in hand and needs to
// know, without recognising a recipe type, whether that record's current schema is also this recipe's.
//
// The role must be filled exactly once. A declaration naming a role its model never fills, or fills twice,
// describes a recipe that cannot be resolved either, and answering with one of the two would be a guess.
//
// The edge's model path comes back with it, because a consumer holding an answer about this source needs to
// know when the selection under it has been rewritten - which is a fact about a model field it must not have
// to name itself.

import {recipeType} from '../recipeTypeRegistry.js'
import {directSourceEdges} from '../source/directSources.js'
import {inheritedSchemaRole} from './transformation.js'

export const INHERITED = 'INHERITED'
export const NOT_INHERITED = 'NOT_INHERITED'
export const UNRESOLVED_ROLE = 'UNRESOLVED_ROLE'

export const inheritedSchemaSource = recipe => {
    const role = inheritedSchemaRole(recipeType(recipe?.type)?.imageOutput)
    if (role === undefined) {
        return {status: NOT_INHERITED, role: undefined, reference: null, path: null}
    }
    const matching = directSourceEdges(recipe).edges.filter(edge => edge.role === role)
    return matching.length === 1
        ? {status: INHERITED, role, reference: matching[0].reference, path: matching[0].path}
        : {status: UNRESOLVED_ROLE, role, reference: null, path: null}
}
