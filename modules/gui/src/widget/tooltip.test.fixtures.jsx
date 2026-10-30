import React from 'react'

// Tooltip stubs that inspect wording use the presentation's plain equivalent. Interactive feedback is exercised
// separately with the real Tooltip, translations and recipe navigation.
export const tooltipText = value => {
    if (React.isValidElement(value)) return typeof value.props.text === 'string' ? value.props.text : value
    if (Array.isArray(value)) return value.map(tooltipText)
    if (value?.constructor === Object) return Object.fromEntries(Object.entries(value).map(([key, value]) => [key, tooltipText(value)]))
    return value
}
