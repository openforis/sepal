// A required image-output field is absent or blank.
export const INCOMPLETE_IMAGE_OUTPUT = 'INCOMPLETE_IMAGE_OUTPUT'

// A supplied image-output field has an unreadable shape or type.
export const MALFORMED_IMAGE_OUTPUT = 'MALFORMED_IMAGE_OUTPUT'

// A later band descriptor repeats an earlier band name.
export const DUPLICATE_BAND_NAME = 'DUPLICATE_BAND_NAME'

// A recipe reached during resolution whose type declares no image output provider. Reported rather than treated as
// observable: a type that has not said how it provides an output has not said it provides its input's.
export const UNDECLARED_OUTPUT = 'UNDECLARED_OUTPUT'

// No observation was supplied for an execution reference whose output can only be observed. Applies to
// assets, which are leaves, and equally to recipes whose provider asks for its own observation.
export const UNAVAILABLE_DESCRIPTION = 'UNAVAILABLE_DESCRIPTION'

// Only an undeclared output may be treated as unknown; any other diagnosis is a fault or an unavailable read.
export const isUndeclaredOutputOnly = diagnostics =>
    Array.isArray(diagnostics)
    && diagnostics.length > 0
    && diagnostics.every(({code}) => code === UNDECLARED_OUTPUT)

// A provider reads its declared role, and no edge of the recipe carries it.
export const MISSING_ROLE = 'MISSING_ROLE'

// A provider reads its declared role, and more than one edge carries it, so its single input cannot be chosen.
// Reported rather than resolved by edge position, which is not a contract.
export const AMBIGUOUS_ROLE = 'AMBIGUOUS_ROLE'
