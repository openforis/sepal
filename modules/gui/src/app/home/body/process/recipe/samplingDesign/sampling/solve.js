// Smallest integer n in [min, max] with fun(n) <= 0, for a non-increasing fun (e.g. margin of error
// as a function of sample size). Returns min when the target is already met at min, and max when it
// is unreachable within the range (the caller decides feasibility). NaN propagates.
export const findRoot = ({fun, min, max}) => {
    const fMin = fun(min)
    const fMax = fun(max)
    if (isNaN(fMin) || isNaN(fMax)) {
        return NaN
    }
    if (fMin <= 0) {
        return min
    }
    if (fMax > 0) {
        return max
    }
    let lo = min // fun(lo) > 0
    let hi = max // fun(hi) <= 0
    while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2)
        const fMid = fun(mid)
        if (isNaN(fMid)) {
            return NaN
        }
        if (fMid <= 0) {
            hi = mid
        } else {
            lo = mid
        }
    }
    return hi
}
