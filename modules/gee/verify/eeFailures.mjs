// What an Earth Engine refusal means, for the hand-run probes in this directory.
//
// Earth Engine reports an asset that is missing and one the caller may not see with the same words, so
// NOT_VISIBLE is all a message establishes: a creation attempt may follow it, because creating cannot overwrite,
// but a deletion may not be called done. Only the message structures Earth Engine and its client are known to
// produce are read - the captured wording is in test/verify/eeFailures.test.js - and the asset id is taken out
// before anything is matched, because it is the one part of the message the caller chose. Wording nobody has
// seen stays OTHER.

const IDENTIFIER = /'[^']*'|"[^"]*"|https?:\/\/\S+|(?<=\bResource )\S+/g

const NOT_VISIBLE_MESSAGES = [
    /^Asset <id> (?:does not exist or doesn't allow this operation|not found)\.?$/,
    /^Resource <id> could not be found\.?$/,
    /^\w+\.load: \w+ asset <id> not found \(does not exist or caller does not have access\)\.?$/
]

const CLIENT_STATUS = /^Server returned HTTP code: (\d+) for\b/
const CLIENT_UNREACHABLE = /^Failed to contact Earth Engine servers\./
const DROPPED = /\b(?:ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE)\b|socket hang up/
const REFUSED = /\b(?:permission denied|not authorized|unauthorized|forbidden|PERMISSION_DENIED)\b/i

export const failureKind = error => {
    const message = String(error?.message || error || '').replace(IDENTIFIER, '<id>').trim()
    if (NOT_VISIBLE_MESSAGES.some(structure => structure.test(message))) {
        return 'NOT_VISIBLE'
    }
    const [, status] = CLIENT_STATUS.exec(message) || []
    if (status !== undefined) {
        return statusKind(Number(status))
    }
    if (CLIENT_UNREACHABLE.test(message) || DROPPED.test(message)) {
        return 'TRANSPORT'
    }
    return REFUSED.test(message) ? 'PERMISSION_DENIED' : 'OTHER'
}

export const failure = error => ({status: failureKind(error), error: String(error?.message || error)})

const statusKind = status => {
    if (status === 404) {
        return 'NOT_VISIBLE'
    }
    if (status === 401 || status === 403) {
        return 'PERMISSION_DENIED'
    }
    return status === 0 || status >= 500 ? 'TRANSPORT' : 'OTHER'
}
