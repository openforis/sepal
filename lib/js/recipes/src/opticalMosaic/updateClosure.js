// Deterministic edit closure for MOSAIC. Given the user's instruction and the
// current effective model, return a bounded set of {currentValues,
// dependentPaths, guidance} so the update specialist can compose ONE atomic
// recipe_patch operations array that satisfies the validation closure.
//
// Intent classification is deliberately narrow keyword-matching (no NL
// parsing). Anything that doesn't match a known intent falls back to a broad
// closure that simply hands over the effective top-level sections + the full
// editFacts guidance.

const {getEditFacts} = require('./facts')

const DATE_INTENT_KEYWORDS = [
    'target date',
    'targetdate',
    'target-date',
    '/dates/targetdate',
    'season window',
    'season start',
    'seasonstart',
    '/dates/seasonstart',
    'season end',
    'seasonend',
    '/dates/seasonend'
]

const DATE_GUIDANCE = [
    '/dates/seasonStart must be in [targetDate - 1y + 1d, targetDate].',
    '/dates/seasonEnd must be in [targetDate + 1d, targetDate + 1y].',
    'Default annual scan: seasonStart=YYYY-01-01, seasonEnd=(YYYY+1)-01-01, yearsBefore=0, yearsAfter=0.',
    'When changing targetDate, include /dates/seasonStart and /dates/seasonEnd in the same atomic patch if current values fall outside the new window.'
]

const DATE_DEPENDENT_PATHS = [
    '/dates/targetDate',
    '/dates/seasonStart',
    '/dates/seasonEnd',
    '/dates/yearsBefore',
    '/dates/yearsAfter'
]

function getUpdateClosure({instruction, effectiveModel}) {
    if (matchesDateIntent(instruction)) {
        return dateClosure(effectiveModel)
    }
    return broadClosure(effectiveModel)
}

function matchesDateIntent(instruction) {
    const lower = String(instruction || '').toLowerCase()
    return DATE_INTENT_KEYWORDS.some(keyword => lower.includes(keyword))
}

function dateClosure(effectiveModel) {
    const dates = effectiveModel?.dates || {}
    return {
        intent: 'dateWindow',
        currentValues: {
            '/dates/targetDate': dates.targetDate,
            '/dates/seasonStart': dates.seasonStart,
            '/dates/seasonEnd': dates.seasonEnd,
            '/dates/yearsBefore': dates.yearsBefore,
            '/dates/yearsAfter': dates.yearsAfter
        },
        dependentPaths: [...DATE_DEPENDENT_PATHS],
        guidance: [...DATE_GUIDANCE]
    }
}

// Broad intent leaves dependentPaths empty so the specialist doesn't read
// `/` as "patch root" (a JSON Pointer to the document root would be a
// whole-model replace). Empty array means: any model-relative path is in
// scope; narrow your patch via guidance.
function broadClosure(effectiveModel) {
    const topLevel = Object.fromEntries(
        Object.keys(effectiveModel || {}).map(key => [`/${key}`, effectiveModel[key]])
    )
    return {
        intent: 'broad',
        currentValues: topLevel,
        dependentPaths: [],
        guidance: getEditFacts().guidance
    }
}

module.exports = {getUpdateClosure}
