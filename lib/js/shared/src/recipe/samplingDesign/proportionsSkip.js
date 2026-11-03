import {isSkipped} from './stratificationSkip.js'

// Whether a design anticipates proportions at all: the person's choice, apart from Manual and from whether rows exist
// yet. The skip flag is saved as a boolean model field or as the form's toggle, as stratification's is
// (stratificationSkip.js): `true` and `[true]` skip them; `false`, `[]` and absent do not.
//
// Defined once here so the allocation, its review (allocationReview.js), the panels, Retrieve and the task read one
// answer: a disagreement calculates an uncertainty one of them recorded no proportions for.
export const isProportionsSkipped = proportions => isSkipped(proportions?.skip)

export const isProportionsApplicable = model => !isProportionsSkipped(model?.proportions)
