// Default masking model. The GUI's defaultModel is `{}` — there's no
// sensible default for either image. The LLM must populate both
// `imageToMask` and `imageMask` based on user intent. The schema enforces
// this via `required`.

const getDefaults = () => ({})

module.exports = {getDefaults}
