function nameList(names) {
    if (!Array.isArray(names) || !names.length) return '[-]'
    const maxNames = 10
    const head = names.slice(0, maxNames).map(String)
    const suffix = names.length > maxNames ? `,+${names.length - maxNames}` : ''
    return `[${head.join(',')}${suffix}]`
}

function truncate(value, max) {
    return value.length > max ? `${value.slice(0, max)}...` : value
}

// Abbreviates an already-hashed identifier; not a hash function — see
// diagnostics.shortHashOf for that.
function abbreviateHash(hash) {
    return typeof hash === 'string' && hash.length > 12 ? hash.slice(0, 8) : (hash || '-')
}

module.exports = {nameList, truncate, abbreviateHash}
