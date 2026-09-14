import {defer, throwError} from 'rxjs'

// The one place a persisted recipe is read by id. Which authority it is read with belongs to the module
// owning the process - gee reads as the user whose request it is serving, task as the account its sandbox
// was given - so there is deliberately no default here, and a process that configured no reader fails on
// the first reference rather than reading with whatever credentials it happens to hold.
let read$ = null

export const configureRecipeReader = reader => read$ = reader

// Resolved at subscribe rather than at construction: a reference is built long before anyone asks for it,
// and the reader it is read with is the one configured for the job that subscribes.
export const loadRecipe$ = id => defer(() =>
    read$
        ? read$(id)
        : throwError(() => new Error('No recipe reader is configured'))
)
