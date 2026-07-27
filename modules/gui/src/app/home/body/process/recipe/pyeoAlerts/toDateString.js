// Normalize a date to a 'YYYY-MM-DD' string. Accepts a Moment-like value
// (getRecipeType(...).getDateRange returns Moments), an epoch-ms number
// (asset metadata system:time_start/end), or a date/ISO string.
export default value => {
    if (value === null || value === undefined) {
        return value
    }
    if (typeof value === 'string') {
        return value.slice(0, 10)
    }
    if (typeof value === 'number') {
        return new Date(value).toISOString().slice(0, 10)
    }
    if (typeof value.format === 'function') {
        return value.format('YYYY-MM-DD')
    }
    return value
}
