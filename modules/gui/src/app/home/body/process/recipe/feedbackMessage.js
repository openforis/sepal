import {msg} from '~/translate'

// Presentation data only. Keep identity and translated arguments until the UI renders them; plain messages stay
// strings, so requirements, diagnostics and their existing text consumers need no rich-text dependency.
export const recipeReference = (id, name = id) => id ? {recipeId: id, name} : name

export const feedbackMessage = (key, values = {}) => ({key, values})

export const joinFeedback = (messages, separator = ' ') => {
    const parts = messages.filter(Boolean)
    return parts.every(part => typeof part === 'string') ? parts.join(separator) : {parts, separator}
}

export const feedbackText = value => {
    if (value?.recipeId) return value.name
    if (value?.parts) return value.parts.map(feedbackText).join(value.separator)
    if (value?.key && value.values) return msg(value.key, Object.fromEntries(Object.entries(value.values).map(([key, value]) => [key, feedbackText(value)])))
    return value
}

export const describeFeedback = messageContent => ({message: feedbackText(messageContent), messageContent})
