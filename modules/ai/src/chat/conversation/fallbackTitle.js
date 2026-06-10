// Heuristic fallback title from the user/assistant text when the LLM
// produces nothing usable.

import {cleanTitle} from './cleanTitle.js'

const LEADING_FILLER_RE = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+|how\s+(?:do|can)\s+i\s+|i\s+(?:want|need|would like)\s+to\s+|tell\s+me\s+(?:about\s+)?)/i
const GREETING_RE = /^(hi|hello|hey|good\s+(morning|afternoon|evening))\b/i
const THANKS_RE = /^(thanks|thank\s+you)\b/i
const MAX_FALLBACK_WORDS = 6

function fallbackTitle({userText, assistantText}) {
    return titleFromText(userText) || titleFromText(assistantText)
}

function titleFromText(text) {
    if (typeof text !== 'string') return null
    const oneLine = text.split('\n')[0].trim()
    if (!oneLine) return null
    if (GREETING_RE.test(oneLine)) return 'Greeting'
    if (THANKS_RE.test(oneLine)) return 'Thanks'
    const cleaned = oneLine
        .replace(LEADING_FILLER_RE, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/[^\w\s-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    if (!cleaned) return null
    const words = cleaned.split(' ').filter(Boolean).slice(0, MAX_FALLBACK_WORDS)
    return cleanTitle(words.join(' '))
}

export {fallbackTitle}
