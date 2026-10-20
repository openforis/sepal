import {isBlank} from '#sepal/recipe/source/extract'

// Whether a band name is written as the editor accepts one: a letter or underscore, then up to 29 letters, digits or
// underscores. A blank name is not judged here - it is missing, not misspelled. The Band names fields and the section's
// mark both judge by this.
export const invalidBandNameFormat = name => !isBlank(name) && !BAND_NAME.test(name)

const BAND_NAME = /^[a-zA-Z_][a-zA-Z0-9_]{0,29}$/
