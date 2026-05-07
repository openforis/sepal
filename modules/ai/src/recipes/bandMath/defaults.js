// Default bandMath model. Mirrors the GUI's `getDefaultModel` —
// {inputImagery: {images: []}, calculations: {calculations: []}, outputBands: {outputImages: []}}.
// All collections empty: there's no sensible default. The schema's
// `minItems: 1` on inputImagery.images forces the LLM to populate at least
// one input.

const getDefaults = () => ({
    inputImagery: {images: []},
    calculations: {calculations: []},
    outputBands: {outputImages: []}
})

module.exports = {getDefaults}
