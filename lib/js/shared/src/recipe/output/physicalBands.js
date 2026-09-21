// What an image's own pixels establish about a band, where nothing declares it.
//
// A band with array dimensions cannot be pyramided by averaging, so `sample` is the default wherever bands are
// described from an image rather than from a declaration that states its own policy. Scalar and unknown
// dimensionality leave the policy unstated, for destination-time validation.

export const withPhysicalPolicy = band => {
    const arrayDimensions = band?.dataType?.arrayDimensions
    return Number.isInteger(arrayDimensions) && arrayDimensions > 0
        ? {...band, pyramidingPolicy: 'sample'}
        : band
}
