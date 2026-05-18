const MAX_DEBUG_TEXT = 4000

function truncateTo(text, maxLength) {
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}...`
}

module.exports = {truncateTo, MAX_DEBUG_TEXT}
