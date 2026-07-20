// Whether a design is unstratified. The skip flag has existed both as a boolean model field and as the old
// form-toggle shape (an array, non-empty when toggled on), so both representations must be recognized:
// `true` and `[true]` are skipped; `false`, `[]` and absent are not.
//
// Defined here in the shared recipe policy (`#sepal/recipe/samplingDesign/stratificationSkip`) so the GUI
// panels and validators, the task boundary and the EE layer cannot drift into different answers - a
// disagreement silently routes a design down the wrong sampling path.
export const isSkipped = skip =>
    skip === true || (Array.isArray(skip) && skip.length > 0)

export const isStratificationSkipped = stratification =>
    isSkipped(stratification?.skip)
