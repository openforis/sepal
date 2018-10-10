import PropTypes from 'prop-types'
import React from 'react'

let intl
export const initIntl = intlInstance => intl = intlInstance

export const Msg = ({id, ...values}) => (
    <span>{msg(id, values)}</span>
)

Msg.propTypes = {
    id: PropTypes.any.isRequired
}

const flattenDeep = arr => Array.isArray(arr)
    ? arr.reduce((a, b) => a.concat(flattenDeep(b)), [])
    : [arr]

export const msg = (id, values = {}, defaultMessage) => {
    const idString = flattenDeep(id).join('.')
    return intl.formatMessage({
        id: String(idString),
        defaultMessage: defaultMessage || idString
    }, values)
}
