import {createRequire} from 'node:module'

import extensions from '#sepal/ee/extensions'
import {requireOnce} from '#sepal/util'

const require = createRequire(import.meta.url)

// Resolved here rather than by requireOnce, so the client library is this library's own install, the one
// whose googleapis is stubbed out.
export default requireOnce(require.resolve('@google/earthengine'), ee =>
    extensions(ee)
)
