import PropTypes from 'prop-types'
import React from 'react'

import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {AssetCombo} from '~/widget/assetCombo'

import {withFormContext} from './context'
import {inputFeedback, withBusyExplanation, withFeedbackButtons} from './inputFeedback'

class _FormAssetCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onError = this.onError.bind(this)
    }

    render() {
        const {
            form, input, alignment, allowClear, allowedTypes, autoFocus, autoOpen, busyMessage, className, disabled,
            includeNominalScale, inputClassName, keyboard, label, labelButtons, mode, optionsClassName, optionTooltipPlacement, placeholder, placement,
            preferredTypes, readOnly, stayOpenOnSelect, tooltip, tooltipPlacement, warningMessage, onCancel, onLoaded, onLoading
        } = this.props
        const feedback = inputFeedback(form, input)
        return (
            <AssetCombo
                value={input.value}
                alignment={alignment}
                allowClear={allowClear}
                allowedTypes={allowedTypes}
                autoFocus={autoFocus}
                autoOpen={autoOpen}
                busyMessage={busyMessage || feedback.busy}
                className={className}
                disabled={disabled}
                warningMessage={warningMessage || feedback.warning}
                errorMessage={this.getErrorMessage()}
                includeNominalScale={includeNominalScale}
                inputClassName={inputClassName}
                keyboard={keyboard}
                label={label}
                labelButtons={withFeedbackButtons(labelButtons, feedback)}
                mode={mode}
                optionsClassName={optionsClassName}
                optionTooltipPlacement={optionTooltipPlacement}
                placeholder={placeholder}
                placement={placement}
                preferredTypes={preferredTypes}
                readOnly={readOnly}
                stayOpenOnSelect={stayOpenOnSelect}
                tooltip={withBusyExplanation(tooltip, feedback)}
                tooltipPlacement={tooltipPlacement}
                onCancel={onCancel}
                onChange={this.onChange}
                onError={this.onError}
                onLoaded={onLoaded}
                onLoading={onLoading}
            />
        )
    }

    getErrorMessage() {
        const {form, input, errorMessage} = this.props
        return form.getErrorMessage(errorMessage === true ? input : errorMessage)
    }

    onChange(value, option) {
        const {input, onChange} = this.props
        input.set(value)
        onChange && onChange(value, option)
    }

    onError(error) {
        const {onError} = this.props
        return onError && onError(error) || this.defaultOnError(error)
    }

    defaultOnError(error) {
        const {input} = this.props
        const errorMsg = error.response && error.response.messageKey
            ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
            : msg('widget.assetInput.loadError')
        input.setInvalid(errorMsg)
        return false
    }
}

export const FormAssetCombo = compose(
    _FormAssetCombo,
    withFormContext(),
    asFunctionalComponent({
        errorMessage: true
    })
)

FormAssetCombo.propTypes = {
    input: PropTypes.any.isRequired,
    alignment: PropTypes.any,
    allowClear: PropTypes.any,
    allowedTypes: PropTypes.array,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    includeNominalScale: PropTypes.bool,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.string,
    labelButtons: PropTypes.any,
    mode: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
    preferredTypes: PropTypes.array,
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    warningMessage: PropTypes.any,
    onCancel: PropTypes.func,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func
}
