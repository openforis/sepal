// Default remapping model. The GUI's `getDefaultModel` returns `{}` — there
// are no sensible defaults; both `inputImagery.images` and `legend.entries`
// must be populated by the user. The schema's `minItems: 1` on each enforces
// this.
//
// We mirror the GUI here: empty `inputImagery.images` and `legend.entries`,
// which the schema rejects until the LLM fills them in.

const getDefaults = () => ({
    inputImagery: {images: []},
    legend: {entries: []}
})

module.exports = {getDefaults}
