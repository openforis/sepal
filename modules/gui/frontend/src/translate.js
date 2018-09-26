import PropTypes from 'prop-types'
import React from 'react'

let intl
export const initIntl = (intlInstance) => intl = intlInstance

export const Msg = ({id, ...values}) => (
    <span>{msg(id, values)}</span>
)

Msg.propTypes = {
    id: PropTypes.any.isRequired
}

export const msg = (id, values = {}, defaultMessage) => {
    const toString = (id) =>
        Array.isArray(id) ? id.map((element) => toString(element)).join('.') : id
    const idString = toString(id)
    return intl.formatMessage({
        id: String(idString),
        defaultMessage: defaultMessage || idString
    }, values)
}
