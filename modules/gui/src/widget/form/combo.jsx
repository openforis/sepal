import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {Combo} from '~/widget/combo'

import {withFormContext} from './context'
import {inputFeedback, withBusyExplanation, withFeedbackButtons} from './inputFeedback'

class _FormCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onBlur = this.onBlur.bind(this)
    }

    onChange(option) {
        const {input, onChange} = this.props
        input.set(option ? option.value : null)
        setImmediate(() => onChange && onChange(option))
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
            form, input, options, buttons, alignment, allowClear, autoFocus, autoOpen, border, busyMessage, className, disabled,
            inputClassName, keyboard, label, labelButtons, optionsClassName, optionTooltipPlacement, placeholder, hPlacement, vPlacement,
            readOnly, stayOpenOnSelect, tooltip, tooltipPlacement, warningMessage, onCancel, onFilterChange
        } = this.props
        const feedback = inputFeedback(form, input)
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
                busyMessage={busyMessage || feedback.busy}
                className={className}
                disabled={disabled}
                warningMessage={warningMessage || feedback.warning}
                errorMessage={this.getErrorMessage()}
                inputClassName={inputClassName}
                keyboard={keyboard}
                label={label}
                labelButtons={withFeedbackButtons(labelButtons, feedback)}
                optionsClassName={optionsClassName}
                optionTooltipPlacement={optionTooltipPlacement}
                placeholder={placeholder}
                hPlacement={hPlacement}
                vPlacement={vPlacement}
                readOnly={readOnly}
                stayOpenOnSelect={stayOpenOnSelect}
                tooltip={withBusyExplanation(tooltip, feedback)}
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
    withFormContext(),
    asFunctionalComponent({
        errorMessage: true
    })
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
