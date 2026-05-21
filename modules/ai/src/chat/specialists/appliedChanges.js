// Label-enriches JSON Patch operations for user-facing description, without
// touching the raw operations sent to the tool. Uses the recipe spec's
// value-label text (path: token(label)|token(label)) so a patch outcome can be
// narrated with human labels ("Landsat CFMask", "aggressive") instead of raw
// enum ids. Recipe-agnostic: enrichment is driven by the parsed label map and
// the operation's value shape, never by recipe-specific knowledge.

function parseValueLabels(text) {
    const byPath = {}
    if (!text) return byPath
    for (const line of text.split('\n')) {
        const separator = line.indexOf(': ')
        if (separator === -1) continue
        const path = line.slice(0, separator)
        const map = labelMap(line.slice(separator + 2))
        if (Object.keys(map).length) byPath[path] = map
    }
    return byPath
}

function labelMap(tokens) {
    const map = {}
    for (const token of tokens.split('|')) {
        const match = token.match(/^(.*?)\((.*)\)$/)
        if (match) map[match[1]] = match[2]
    }
    return map
}

// context (optional) is the prepare_update packet: currentValues supplies the
// previousValue a change overwrote; pathHints supplies the field shape. Both are
// added per change when available, so the summarizer can explain old -> new
// without re-reading the model.
function enrichOperations(operations, labelsByPath, context) {
    return (operations || []).map(operation => enrichOperation(operation, labelsByPath || {}, context || {}))
}

function enrichOperation(operation, labelsByPath, context) {
    const change = {op: operation.op, path: operation.path}
    const previousValue = context.currentValues?.[operation.path]
    if (previousValue !== undefined && previousValue !== null) change.previousValue = previousValue
    const pathHint = context.pathHints?.[operation.path]
    if (pathHint) change.pathHint = pathHint
    if (!Object.prototype.hasOwnProperty.call(operation, 'value')) return change
    const labels = labelsByPath[operation.path]
    const value = operation.value
    change.value = value
    if (Array.isArray(value)) {
        if (labels) change.valueLabels = value.map(item => labels[String(item)] || item)
    } else if (value === null || typeof value !== 'object') {
        const label = labels?.[String(value)]
        if (label) change.valueLabel = label
    }
    return change
}

module.exports = {parseValueLabels, enrichOperations}
