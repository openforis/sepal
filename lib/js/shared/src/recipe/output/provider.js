// How a recipe type provides its IMAGE_OUTPUT: which bands the configured recipe provides, and what is established
// about them. Pure declarations: they hold no traversal, acquisition or Earth Engine knowledge.
//
// A provider's `describe` receives narrow access and asks only for what its answer needs:
//
//   recipe       the configured recipe being described
//   observation  () → what this recipe's own image establishes, on the terms `observes` names
//   input        () → the resolved description of the one source filling the declared `role`
//   inputs       () → [{role, description}] for every role-bearing source, in declared edge order
//
// Each returns null when what it asked for cannot be had, and the resolver then discards the answer: it has
// already diagnosed why. Shared resolution owns traversal, role validation, acquisition and validation of the
// returned {bands, evidence}.
//
// `observes` names WHICH question about its own image a provider's observation answers. RUNNING_IMAGE is the
// image the producer builds when asked for nothing, with the physical facts of its pixels. AVAILABLE_BANDS is
// what the producer says it can be asked for: names alone, so a provider choosing it supplies their physical
// facts from its own declarations. A producer that computes only what is requested - CCDC fits the measures it
// is given - makes those two different questions, and only the second describes the configured recipe.
//
// `role` and `effects` are declarations rather than behavior, because consumers read them without resolving
// anything: a recipe that declares identity band mapping and preserved values for its role stands for that
// input's current schema. Effects therefore require the role they describe.
//
// Validated where a definition is written, so a malformed provider fails with a stated reason at load.

export const IDENTITY = 'IDENTITY'
export const PRESERVED = 'PRESERVED'
export const NARROWED = 'NARROWED'

export const RUNNING_IMAGE = 'RUNNING_IMAGE'
export const AVAILABLE_BANDS = 'AVAILABLE_BANDS'

const OBSERVATIONS = [RUNNING_IMAGE, AVAILABLE_BANDS]

export const imageOutputProvider = ({describe, role, effects, observes = RUNNING_IMAGE} = {}) =>
    validateImageOutputProvider({
        describe,
        observes,
        ...(role === undefined ? {} : {role}),
        ...(effects === undefined ? {} : {effects})
    })

export const validateImageOutputProvider = provider => {
    const {describe, role, effects, observes} = provider || {}
    if (typeof describe !== 'function') {
        throw new Error(`An image output provider requires a describe function, got: ${JSON.stringify(describe)}`)
    }
    if (role !== undefined && (typeof role !== 'string' || role.trim().length === 0)) {
        throw new Error(`An image output provider role must be non-blank, got: ${JSON.stringify(role)}`)
    }
    if (effects !== undefined && role === undefined) {
        throw new Error('An image output provider declaring effects must declare the role they describe')
    }
    if (observes !== undefined && !OBSERVATIONS.includes(observes)) {
        throw new Error(`An image output provider observes one of ${OBSERVATIONS.join(', ')}, got: ${JSON.stringify(observes)}`)
    }
    return provider
}

// Its input's bands and evidence, unchanged: masking narrows validity and nothing else.
export const preservingProvider = ({role} = {}) => {
    if (typeof role !== 'string' || role.trim().length === 0) {
        throw new Error(`A preserving provider requires a non-blank role, got: ${JSON.stringify(role)}`)
    }
    return imageOutputProvider({
        role,
        effects: {bandMapping: IDENTITY, values: PRESERVED, validity: NARROWED},
        describe: ({input}) => {
            const description = input()
            return description && {bands: description.output.bands, evidence: description.evidence}
        }
    })
}

// The role whose current band schema and values also describe this output, or undefined when the provider does
// not declare that. Undeclared is deliberately the same answer as "changes its input".
export const inheritedSchemaRole = provider => {
    const {role, effects} = provider || {}
    return effects?.bandMapping === IDENTITY && effects?.values === PRESERVED
        ? role
        : undefined
}
