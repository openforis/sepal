// Which alerts a caller asked to see. Stating no filter is not the same as stating an empty one: a caller
// that states none - an export, a recipe reading this one as a source, a histogram - gets the whole alert
// product, with the flag band carrying the confidence for whoever wants to filter on it afterwards. There is
// one BAYTS product, and only a caller that states a filter sees less than it.
//
// Free of Earth Engine: this decides which filters apply, and the caller applies them.

const INCLUDE = 'include'
const ALL = 'all'

export const alertFilter = ({previouslyConfirmed, minConfidence} = {}) => ({
    excludePreviouslyConfirmed: (previouslyConfirmed ?? INCLUDE) !== INCLUDE,
    minConfidence: minConfidence ?? ALL
})
