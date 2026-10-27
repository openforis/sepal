import {defer, throwError} from 'rxjs'

import {currentRecipeScope} from './recipeScope.js'

// The one place a persisted recipe is read by id, and it reads only within an execution operation.
// The operation owns both the authority the read is made with and the records already read, so one
// operation never mixes two revisions of the same recipe, and a read that arrives late is not made
// with whatever authority the process was configured with meanwhile.
//
// Resolved at subscribe rather than at construction: a reference is built long before anyone asks for
// it, and the operation it belongs to is the one that subscribes.
export const loadRecipe$ = id => defer(() => {
    const scope = currentRecipeScope()
    return scope
        ? scope.read$(id)
        : throwError(() => new Error(`No execution operation in progress; cannot read recipe: ${id}`))
})
