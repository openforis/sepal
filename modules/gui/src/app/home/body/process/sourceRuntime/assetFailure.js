// Which of the assets an operation read its failure may be about, so they can be read again (assetRefresh.js).
//
//   - An asset the operation read, named in the failure: that asset. Reading it is only a check; what the read
//     answers decides whether it is missing.
//   - Bands an image was asked for that it does not hold - its schema is not what was described: every asset read.
//   - Anything else - an expression error, an invalid configuration, a computation that failed - says nothing about
//     any input, and reads nothing again.
//
// Earth Engine names an asset in several spellings; ids are compared without the project prefix it adds to legacy and
// public assets.

export const assetsFailedBy = (error, assets = []) => {
    const message = messageOf(error)
    if (!message || !assets.length) {
        return []
    }
    const named = [
        ...[...message.matchAll(NAMED_ASSET)].map(([, , id]) => id),
        ...[...message.matchAll(NOT_FOUND_ASSET)].map(([, id]) => id)
    ].map(normalized)
    const failed = assets.filter(id => named.includes(normalized(id)))
    if (failed.length) {
        return failed
    }
    return SCHEMA_MISMATCH.test(message) ? [...assets] : []
}

const NAMED_ASSET = /(asset|collection)\s+['"]([^'"]+)['"]/gi
const NOT_FOUND_ASSET = /asset not found:\s*(\S+)/gi
const SCHEMA_MISMATCH = /did not match any bands|no band named|band pattern/i

const normalized = id => id.replace(/^projects\/earthengine-(legacy|public)\/assets\//, '')

// An HTTP failure carries Earth Engine's message in its response; anything else in its own message.
const messageOf = error => {
    const response = error?.response
    return [
        response?.messageArgs?.earthEngineMessage,
        response?.defaultMessage,
        typeof response === 'string' ? response : null,
        error?.message
    ].filter(Boolean).join('\n')
}
