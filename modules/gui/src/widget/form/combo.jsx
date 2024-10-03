import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {Combo} from '~/widget/combo'

import {withFormContext} from './context'

class _FormCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onBlur = this.onBlur.bind(this)
    }

    onChange(option) {
        const {input, onChange} = this.props
        input.set(option ? option.value : null)
        onChange && onChange(option)
    }

    onBlur() {
        const {input} = this.props
        input.validate()
    }

    getErrorMessage() {
        const {form, input, errorMessage} = this.props
        return form.getErrorMessage(errorMessage === true ? input : errorMessage)
    }

    render() {
        const {
            input, options, buttons, alignment, allowClear, autoFocus, autoOpen, border, busyMessage, className, disabled,
            inputClassName, keyboard, label, labelButtons, optionsClassName, optionTooltipPlacement, placeholder, placement,
            readOnly, stayOpenOnSelect, tooltip, tooltipPlacement, warningMessage, onCancel, onFilterChange
        } = this.props
        return (
            <Combo
                value={input.value}
                options={options}
                buttons={buttons}
                alignment={alignment}
                allowClear={allowClear}
                autoFocus={autoFocus}
                autoOpen={autoOpen}
                border={border}
                busyMessage={busyMessage}
                className={className}
                disabled={disabled}
                warningMessage={warningMessage}
                errorMessage={this.getErrorMessage()}
                inputClassName={inputClassName}
                keyboard={keyboard}
                label={label}
                labelButtons={labelButtons}
                optionsClassName={optionsClassName}
                optionTooltipPlacement={optionTooltipPlacement}
                placeholder={placeholder}
                placement={placement}
                readOnly={readOnly}
                stayOpenOnSelect={stayOpenOnSelect}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                onCancel={onCancel}
                onFilterChange={onFilterChange}
                onChange={this.onChange}
                onBlur={this.onBlur}
            />
        )
    }
}

export const FormCombo = compose(
    _FormCombo,
    withFormContext()
)

FormCombo.propTypes = {
    input: PropTypes.any.isRequired,
    options: PropTypes.any.isRequired,
    alignment: PropTypes.any,
    allowClear: PropTypes.any,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    border: PropTypes.any,
    busyMessage: PropTypes.any,
    buttons: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    warningMessage: PropTypes.any,
    onCancel: PropTypes.func,
    onChange: PropTypes.func,
    onFilterChange: PropTypes.func
}

FormCombo.defaultProps = {
    errorMessage: true
}
