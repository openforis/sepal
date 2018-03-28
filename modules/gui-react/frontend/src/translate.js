import React from 'react'
import {FormattedMessage} from 'react-intl'
import PropTypes from 'prop-types'

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

export const msg = (id, values = {}, defaultMessage = id) => intl.formatMessage({id, defaultMessage}, values)
