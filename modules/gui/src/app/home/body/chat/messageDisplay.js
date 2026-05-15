export const displayedContent = (message, translate) => {
    const {content, display} = message
    if (!display?.key) return content
    return translate(display.key, display.args || {}, display.fallback || content)
}
