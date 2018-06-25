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
    const toString = (id) => {
        if (!Array.isArray(id))
            return id
        return id.map((element) => toString(element)).join('.')
    }
    const idString = toString(id)
    return intl.formatMessage({
        id: String(idString),
        defaultMessage: defaultMessage || idString
    }, values)
}
