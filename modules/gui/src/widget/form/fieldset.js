import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {withFormContext} from '~/widget/form/context'
import {Widget} from '~/widget/widget'

class _FormFieldSet extends React.Component {
    render() {
        const {form, className, layout, spacing, disabled, label, labelButtons,
            tooltip, tooltipPlacement, errorMessage, busyMessage, children} = this.props
        return (
            <Widget
                className={className}
                layout={layout}
                spacing={spacing}
                disabled={disabled}
                label={label}
                labelButtons={labelButtons}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage && form.getErrorMessage(errorMessage)}
                busyMessage={busyMessage}
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
    labelButtons: PropTypes.any,
    layout: PropTypes.any,
    spacing: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any
}

FormFieldSet.defaultProps = {
    spacing: 'normal',
    layout: 'vertical'
}
