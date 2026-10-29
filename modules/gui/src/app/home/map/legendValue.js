import _ from 'lodash'

// The number a legend row's value states, read whole - `1e3` is 1000 - or NaN where it states none, blank included. A
// value is held as entered until its legend is committed, and is valid where this is finite.
export const legendValue = value =>
    _.isNumber(value) ? value : _.isString(value) && value.trim() ? Number(value) : NaN
