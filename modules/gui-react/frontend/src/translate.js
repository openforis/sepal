import PropTypes from 'prop-types'
import React from 'react'
import {FormattedMessage} from 'react-intl'

let intl
export const initIntl = (intlInstance) => intl = intlInstance

export const Msg = ({id, ...values}) => (
    <FormattedMessage
        id={id}
        values={values}
    />
)

Msg.propTypes = {
    id: PropTypes.string.isRequired
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
