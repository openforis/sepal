// Pure numeric range rules for the Sampling Design planning inputs, shared by the panels and their tests.
// These helpers validate planning inputs; they do not transform values or implement allocation formulas.

// A confidence level of 0% or 100% describes no usable interval, so the bounds are strict.
export const isValidConfidenceLevel = value =>
    Number.isFinite(Number(value)) && Number(value) > 0 && Number(value) < 100

// The power tuning constant interpolates between allocation shapes; outside 0-1 it has no defined meaning.
export const isValidPowerTuningConstant = value =>
    Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 1

// Anticipated proportions are entered as percentages, inclusive of both ends.
export const isValidProportionPercentage = value =>
    Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 100

// The overall override is optional: blank means "no override".
export const isValidOptionalProportionPercentage = value =>
    value == null || String(value).trim() === '' || isValidProportionPercentage(value)
