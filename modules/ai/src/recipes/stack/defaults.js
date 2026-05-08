// Default stack model. Mirrors GUI's getDefaultModel — both collections empty;
// the LLM must populate. Schema's minItems:1 on inputImagery.images forces it.

const getDefaults = () => ({
    inputImagery: {images: []},
    bandNames: {bandNames: []}
})

module.exports = {getDefaults}
