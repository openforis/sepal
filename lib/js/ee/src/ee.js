import {createRequire, registerHooks} from 'node:module'
import {pathToFileURL} from 'node:url'

import extensions from '#sepal/ee/extensions'
import {requireOnce} from '#sepal/util'

const require = createRequire(import.meta.url)

// Resolved here rather than by requireOnce, so the client library is this library's own install, the one
// whose googleapis is stubbed out.
const LIBRARY_PATH = require.resolve('@google/earthengine')

// The client library strips own `constructor` keys from every argument of every call it builds, walking the
// argument deeply - through any expression among them, and so through the whole graph built so far. That makes
// building a graph quadratic: most of the CPU of a mosaic or time-series export. An expression's own arguments
// were stripped when it was built, so the walk stops at one.
const DELETE_PROTO_START = `function deleteProto(obj, opt_seen) {
  if (!obj || typeof obj !== "object") {
    return obj;
  }
`
const STOP_AT_EXPRESSIONS = `  if (obj instanceof ee.Encodable) {
    return obj;
  }
`

const loadClientLibrary = () => {
    const libraryUrl = pathToFileURL(LIBRARY_PATH).href
    const hooks = registerHooks({
        load: (url, context, nextLoad) => {
            const result = nextLoad(url, context)
            return url === libraryUrl
                ? {...result, source: stopDeleteProtoAtExpressions(String(result.source))}
                : result
        }
    })
    try {
        return requireOnce(LIBRARY_PATH, ee => extensions(ee))
    } finally {
        hooks.deregister()
    }
}

const stopDeleteProtoAtExpressions = source => {
    const parts = source.split(DELETE_PROTO_START)
    if (parts.length !== 2) {
        throw new Error(`@google/earthengine no longer defines deleteProto as ${LIBRARY_PATH} expects: revisit lib/js/ee/src/ee.js`)
    }
    return parts.join(DELETE_PROTO_START + STOP_AT_EXPRESSIONS)
}

export default loadClientLibrary()
