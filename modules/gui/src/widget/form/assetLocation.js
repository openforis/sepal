import {AssetLocation} from 'widget/assetLocation'
import {compose} from 'compose'
import {connect} from 'store'
import {withFormContext} from './context'
import PropTypes from 'prop-types'
import React from 'react'

class _FormAssetLocation extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
    }

    render() {
        const {form, input, className, label, labelButtons, tooltip, tooltipPlacement, disabled, errorMessage} = this.props
        return (
            <AssetLocation
                className={className}
                label={label}
                labelButtons={labelButtons}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                errorMessage={form.getErrorMessage(errorMessage === true ? input : errorMessage)}
                value={input.value}
                onChange={this.onChange}
            />
        )
    }

    onChange(value) {
        const {input, onChange} = this.props
        input.set(value)
        onChange && onChange(value)
    }
}

export const FormAssetLocation = compose(
    _FormAssetLocation,
    withFormContext(),
    connect()
)

FormAssetLocation.propTypes = {
    input: PropTypes.object.isRequired,
    className: PropTypes.any,
    disabled: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    tooltip: PropTypes.any,
    onChange: PropTypes.func,
}
