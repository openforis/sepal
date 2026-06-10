// Title-cleaning helpers for an LLM-generated title: strips <think>
// blocks, list markers, "Title:" preambles, wrapping quotes, and
// trailing punctuation. Caps to TITLE_MAX_CHARS.

const TITLE_MAX_CHARS = 80
const QUOTE_CHARS = '"\'`'
const TRAILING_PUNCT = '.?!,:;'
const PREAMBLE_RE = /^(?:title|subject|conversation|topic|summary|chat|name)\s*[:\-–]\s*/i
const LIST_MARKER_RE = /^(?:\d+[.)]\s+|[-*]\s+)/
const THINK_TAGS_RE = /<think>[\s\S]*?<\/think>/gi

function cleanTitle(raw) {
    if (typeof raw !== 'string') return null
    const withoutThinking = raw.replace(THINK_TAGS_RE, '').trim()
    const firstLine = withoutThinking.split('\n')[0].trim()
    const stripped = stripTrailingPunctuation(stripWrappingQuotes(stripPreamble(firstLine)))
    if (!stripped) return null
    return stripped.length > TITLE_MAX_CHARS ? stripped.substring(0, TITLE_MAX_CHARS) : stripped
}

function stripWrappingQuotes(title) {
    let result = title
    while (result.length >= 2 && QUOTE_CHARS.includes(result[0]) && result[result.length - 1] === result[0]) {
        result = result.slice(1, -1).trim()
    }
    return result
}

function stripTrailingPunctuation(title) {
    let result = title
    while (result.length && TRAILING_PUNCT.includes(result[result.length - 1])) {
        result = result.slice(0, -1).trim()
    }
    return result
}

function stripPreamble(title) {
    let result = title
    let prev = null
    while (prev !== result) {
        prev = result
        result = result.replace(PREAMBLE_RE, '').replace(LIST_MARKER_RE, '').trim()
    }
    return result
}

export {cleanTitle}
