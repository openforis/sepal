import gaussian from 'gaussian'
import _ from 'lodash'

export const calculateBounds = ({confidenceLevel, allocation}) => {
    // console.log('calculateBounds', {confidenceLevel, allocation})
    const distribution = gaussian(0, 1)
    const z = distribution.ppf(1 - (1 - confidenceLevel) / 2)
    const stratraBounds = allocation.map(stratum => calculateStratumBounds({z, stratum}))
    const lowerError = Math.sqrt(
        _.sum(
            stratraBounds.map(([lower, _upper, p, w]) => Math.pow(w * (p - lower), 2))
        )
    )
    const upperError = Math.sqrt(
        _.sum(
            stratraBounds.map(([_lower, upper, p, w]) => Math.pow(w * (upper - p), 2))
        )
    )
    const proportion = _.sum(
        allocation.map(({weight, proportion}) => weight * proportion)
    )
    return [
        proportion - lowerError,
        proportion,
        proportion + upperError
    ]
}

// export const calculateStratumErrors = ({confidenceLevel, allocation, relative}) => {
//     // console.log('calculateStratumErrors', {confidenceLevel, allocation})
//     const distribution = gaussian(0, 1)
//     const z = distribution.ppf(1 - (1 - confidenceLevel) / 2)
//     return allocation.map(stratum => {
//         const [lower, upper, p, w] = calculateStratumBounds({z, stratum})
//         const lowerError = p - lower
//         const upperError = upper - p
//         // TODO: Figure this out...
//         const error = Math.max(lowerError, upperError) * w
        
//         return relative
//             ? error / p
//             : error
//     })
// }

const calculateStratumBounds = ({z, stratum: {weight: w, proportion: p, sampleSize: n}}) => {
    const z2 = Math.pow(z, 2)
    const lower = (2 * n * p + z2 - (z * sqrt(z2 - 1 / n + 4 * n * p * (1 - p) + (4 * p - 2)) + 1)) / (2 * (n + z2))
    const upper = (2 * n * p + z2 + (z * sqrt(z2 - 1 / n + 4 * n * p * (1 - p) - (4 * p - 2)) + 1)) / (2 * (n + z2))
    // console.log([lower, p, upper])
    return [
        Math.max(0, lower),
        Math.min(1, upper),
        p,
        w,
    ]
}

// Rounding errors can cause the number to be < 0
const sqrt = number => number > 0
    ? Math.sqrt(number)
    : 0
