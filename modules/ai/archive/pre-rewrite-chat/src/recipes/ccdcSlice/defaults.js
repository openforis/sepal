// Default ccdcSlice model. Mirrors GUI defaultModel.
// `date.date` and `source` intentionally absent — the LLM must populate.

const getDefaults = () => ({
    options: {
        harmonics: 3,
        gapStrategy: 'INTERPOLATE',
        extrapolateSegment: 'CLOSEST',
        extrapolateMaxDays: 30,
        skipBreakInLastSegment: false
    }
})

module.exports = {getDefaults}
