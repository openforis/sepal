import {compose} from 'compose'
import {withFormContext} from './context'
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

// export const FormError = props => {
//     const errorMessage = form =>
//         getErrorMessage(form, props['for'])
        
//     return (
//         <FormContext.Consumer>
//             {errorMessage}
//         </FormContext.Consumer>
//     )
// }

class _FormError extends React.Component {
    render() {
        const {props, form} = this.props
        return getErrorMessage(form, props['for'])
    }
}

export const FormError = compose(
    _FormError,
    withFormContext()
)

FormError.propTypes = {
    'for': PropTypes.any.isRequired,
    className: PropTypes.string
}
