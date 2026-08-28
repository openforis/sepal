// How a recipe type produces its IMAGE_OUTPUT. Pure declarations: they package what a type states about
// its own output and hold no resolution, graph traversal or Earth Engine knowledge.
//
// Three shapes, because three things genuinely differ. An intrinsic node's bands are a property of the
// running image, so it derives them from the observation supplied for its own reference rather than
// carrying a static list. A one-input transformation names the role it consumes and must state what it
// does to that input - preservation is declared, never assumed, because a one-input recipe is as free to
// change values and schema as to pass them through. An n-ary transformation receives every role-bearing
// input in declared edge order, repeated roles included, and states its own mapping.
//
// Arguments are validated here rather than at resolution, following defineRecipeType: a declaration is
// written once and read on every resolution, so a malformed one must fail where it is written, with a
// stated reason, instead of surfacing much later as a TypeError inside the resolver.

export const INTRINSIC = 'INTRINSIC'
export const ONE_INPUT = 'ONE_INPUT'
export const N_ARY = 'N_ARY'

const requireFunction = (value, description) => {
    if (typeof value !== 'function') {
        throw new Error(`${description}, got: ${JSON.stringify(value)}`)
    }
}

const requireRole = role => {
    if (typeof role !== 'string' || role.trim().length === 0) {
        throw new Error(`A one-input transformation requires a non-blank role, got: ${JSON.stringify(role)}`)
    }
}

export const intrinsicImageOutput = ({derive} = {}) => {
    requireFunction(derive, 'An intrinsic image output requires a derive function')
    return {kind: INTRINSIC, derive}
}

export const oneInputTransformation = ({role, transform} = {}) => {
    requireRole(role)
    requireFunction(transform, `A one-input transformation for role ${JSON.stringify(role)} requires a transform function; one that passes its input through declares "preservingTransformation({role})"`)
    return {kind: ONE_INPUT, role, transform}
}

// An ordinary one-input transformation whose transform happens to be the identity, so preservation is
// visible as the function it is and the resolver has no marker to interpret.
export const preservingTransformation = ({role} = {}) => oneInputTransformation({
    role,
    transform: ({input: {description}}) => ({
        bands: description.output.bands,
        evidence: description.evidence
    })
})

export const naryTransformation = ({transform} = {}) => {
    requireFunction(transform, 'An n-ary transformation requires a transform function')
    return {kind: N_ARY, transform}
}
