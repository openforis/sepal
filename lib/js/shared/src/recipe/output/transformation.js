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

// What a transformation does to its input, declared rather than inferred. Only what a consumer has to
// decide something from is named: whether output band names stand in a one-to-one identity with the
// input's, and whether the values under those names are the input's own. A consumer reading these decides
// for itself what they license; nothing here says which capabilities survive.
export const IDENTITY = 'IDENTITY'
export const PRESERVED = 'PRESERVED'
export const NARROWED = 'NARROWED'

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

// The one structural check for this declaration family, shared by the constructors and by recipe-definition
// validation. A definition can be written by hand or lose a field in an edit without any constructor being
// called, and two sets of rules would drift. Scoped to IMAGE_OUTPUT deliberately: a later capability may
// declare transformations with a different contract, and it should not inherit these rules by name.
export const validateImageOutputTransformation = declaration => {
    const {kind, role, derive, transform} = declaration || {}
    switch (kind) {
        case INTRINSIC:
            requireFunction(derive, 'An intrinsic image output requires a derive function')
            break
        case ONE_INPUT:
            requireRole(role)
            requireFunction(transform, `A one-input transformation for role ${JSON.stringify(role)} requires a transform function; one that passes its input through declares "preservingTransformation({role})"`)
            break
        case N_ARY:
            requireFunction(transform, 'An n-ary transformation requires a transform function')
            break
        default:
            // Not a stylistic check: the resolver tests ONE_INPUT and treats everything else as n-ary, so an
            // unrecognized kind would silently be handed every edge of its recipe instead of being reported.
            throw new Error(`An image output transformation requires a known kind (${INTRINSIC}, ${ONE_INPUT} or ${N_ARY}), got: ${JSON.stringify(kind)}`)
    }
    return declaration
}

export const intrinsicImageOutput = ({derive} = {}) =>
    validateImageOutputTransformation({kind: INTRINSIC, derive})

export const oneInputTransformation = ({role, transform} = {}) =>
    validateImageOutputTransformation({kind: ONE_INPUT, role, transform})

// An ordinary one-input transformation whose transform happens to be the identity, so preservation is
// visible as the function it is and the resolver has no marker to interpret.
//
// The declared effects are for consumers rather than the resolver: they let one ask which input describes
// this recipe's current schema without knowing the recipe type, which is what makes the same answer
// available to a type that declares the same thing tomorrow. Reading the transform function to find that
// out is not possible, and testing the type name is the coupling every one of these contracts exists to
// remove.
export const preservingTransformation = ({role} = {}) => ({
    ...oneInputTransformation({
        role,
        transform: ({input: {description}}) => ({
            bands: description.output.bands,
            evidence: description.evidence
        })
    }),
    effects: {bandMapping: IDENTITY, values: PRESERVED, validity: NARROWED}
})

// The role of the single input whose current band schema and values also describe this output, or
// undefined when the declaration does not claim that. Undeclared is the answer for every type that has
// not stated its effects, which is most of them, and it is deliberately the same answer as "changes its
// input": a consumer may only inherit where inheritance was declared.
export const inheritedSchemaRole = declaration => {
    const {kind, role, effects} = declaration || {}
    return kind === ONE_INPUT && effects?.bandMapping === IDENTITY && effects?.values === PRESERVED
        ? role
        : undefined
}

export const naryTransformation = ({transform} = {}) =>
    validateImageOutputTransformation({kind: N_ARY, transform})
