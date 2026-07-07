import {msg} from '~/translate'

// Legacy generic-failure descriptor whose message/translation is just "{error}" - it renders the raw
// String(error) (e.g. "ServerException: ...") and must never reach the user.
const LEGACY_RAW_FAILURE_KEY = 'tasks.status.failed'
const GENERIC_FAILURE_KEY = 'tasks.status.failedGeneric'

// A plain message that looks like a technical failure (exception/error prefix, a stack trace, or raw
// JSON) rather than user-facing text - old records may carry these directly in statusDescription.
const looksTechnical = text =>
    /\w*(?:Exception|Error):/.test(text)
        || /\n\s*at\s/.test(text)
        || /^\s*[[{]/.test(text)

// Localized, user-facing task status/failure text from the backend `statusDescription`, which is either a
// plain string or a JSON {messageKey, messageArgs, defaultMessage} descriptor. Never returns raw JSON or
// technical prefixes: curated structured descriptors (e.g. Sampling Design guidance, Earth Engine errors)
// are localized through msg(); the legacy raw-failure descriptor and any technical-looking text are
// replaced with the generic failure message; anything missing or malformed falls back to "executing".
export const taskStatusDescription = task => {
    let description
    try {
        description = JSON.parse(task?.statusDescription)
    } catch (_error) {
        description = task?.statusDescription
    }
    if (typeof description === 'string' && description) {
        return looksTechnical(description) ? msg(GENERIC_FAILURE_KEY) : description
    }
    if (description && typeof description === 'object') {
        if (description.messageKey === LEGACY_RAW_FAILURE_KEY) {
            return msg(GENERIC_FAILURE_KEY)
        }
        if (description.messageKey) {
            return msg(description.messageKey, description.messageArgs, description.defaultMessage)
        }
        if (description.defaultMessage) {
            return looksTechnical(description.defaultMessage) ? msg(GENERIC_FAILURE_KEY) : description.defaultMessage
        }
    }
    return msg('tasks.status.executing')
}
