// A required image-output field is absent or blank.
export const INCOMPLETE_IMAGE_OUTPUT = 'INCOMPLETE_IMAGE_OUTPUT'

// A supplied image-output field has an unreadable shape or type.
export const MALFORMED_IMAGE_OUTPUT = 'MALFORMED_IMAGE_OUTPUT'

// A later band descriptor repeats an earlier band name.
export const DUPLICATE_BAND_NAME = 'DUPLICATE_BAND_NAME'

// A recipe reached during resolution whose type declares no image output. Reported rather than treated as
// intrinsic: a type that has not said how it produces an output has not said it produces its input's.
export const UNDECLARED_OUTPUT = 'UNDECLARED_OUTPUT'

// No observation was supplied for an execution reference whose output can only be observed. Applies to
// assets, which are leaves, and equally to intrinsic recipe nodes.
export const UNAVAILABLE_DESCRIPTION = 'UNAVAILABLE_DESCRIPTION'

// A transformation declares a role that no edge of the recipe carries.
export const MISSING_ROLE = 'MISSING_ROLE'

// A one-input transformation's declared role is carried by more than one edge, so its single input cannot
// be chosen. Reported rather than resolved by edge position, which is not a contract.
export const AMBIGUOUS_ROLE = 'AMBIGUOUS_ROLE'
