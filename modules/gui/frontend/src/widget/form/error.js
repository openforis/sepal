import {FormContext} from './context'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export const getErrorMessage = (form, input) =>
    _.chain([input])
        .flatten()
        .compact()
        .map(source =>
            _.isString(source)
                ? form.errors[source]
                : source.error
        )
        .find(error => error)
        .value() || ''

export const FormError = props => {
    return (
        <FormContext.Consumer>
            {form => getErrorMessage(form, props['for'])}
        </FormContext.Consumer>
    )
}

FormError.propTypes = {
    'for': PropTypes.any.isRequired,
    className: PropTypes.string
}
