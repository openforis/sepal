// Controlled diagnostics for references that cannot be turned into edges.
//
// A broken reference must never resolve to nothing: a recipe whose source lost its id would otherwise look
// exactly like a recipe that has no source, and the graph would silently shrink. Every code below is
// stable and carries the model path it was found at.

// A reference position that has been filled in but is missing its id.
export const INCOMPLETE_REFERENCE = 'INCOMPLETE_REFERENCE'

// A reference position holding something that is not a reference this contract understands.
export const MALFORMED_REFERENCE = 'MALFORMED_REFERENCE'

// Asked about a recipe type that has no shared definition. Reported rather than answered with an empty edge
// list, which would read as "no dependencies".
export const UNSUPPORTED_RECIPE_TYPE = 'UNSUPPORTED_RECIPE_TYPE'

// A referenced recipe that is not among the records the graph was given. Deduplicated per absent recipe: one
// node is unavailable, and a user restores or reselects it once however many edges reach it.
export const MISSING_SOURCE = 'MISSING_SOURCE'

// An edge that points back at a recipe already on the path being followed. Reported per closing edge rather
// than per repeated recipe: two edges closing a cycle are two selections, in two recipes, to change.
export const CYCLIC_DEPENDENCY = 'CYCLIC_DEPENDENCY'

export const diagnostic = ({code, role, path}) =>
    role === undefined ? {code, path} : {code, role, path}
