import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {getErrorMessage} from 'widget/form/error'
import {withFormContext} from 'widget/form/context'
import PropTypes from 'prop-types'
import React from 'react'

class _FormFieldSet extends React.Component {
    render() {
        const {form, className, layout, spacing, disabled, label,
            tooltip, tooltipPlacement, errorMessage, children} = this.props
        return (
            <Widget
                className={className}
                layout={layout}
                spacing={spacing}
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage && getErrorMessage(form, errorMessage)}
            >
                {children}
            </Widget>
        )
    }
}

export const FormFieldSet = compose(
    _FormFieldSet,
    withFormContext()
)

FormFieldSet.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any
}

FormFieldSet.defaultProps = {
    spacing: 'normal',
    layout: 'vertical'
}
