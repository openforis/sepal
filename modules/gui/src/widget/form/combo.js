import {Combo} from 'widget/combo'
import PropTypes from 'prop-types'
import React from 'react'

export const FormCombo = ({
    input, options, additionalButtons, alignment, allowClear, autoFocus, autoOpen, busyMessage, className, disabled,
    errorMessage, inputClassName, keyboard, label, matchGroups, optionsClassName, optionTooltipPlacement, placeholder, placement,
    readOnly, stayOpenOnSelect, tooltip, tooltipPlacement, onCancel, onChange
}) => {
    const onChangeHandler = option => {
        input.set(option ? option.value : null)
        onChange && onChange(option)
    }
    const onBlurHandler = () =>
        input.validate()

    return (
        <Combo
            value={input.value}
            options={options}
            additionalButtons={additionalButtons}
            alignment={alignment}
            allowClear={allowClear}
            autoFocus={autoFocus}
            autoOpen={autoOpen}
            busyMessage={busyMessage}
            className={className}
            disabled={disabled}
            errorMessage={errorMessage || [input]}
            inputClassName={inputClassName}
            keyboard={keyboard}
            label={label}
            matchGroups={matchGroups}
            optionsClassName={optionsClassName}
            optionTooltipPlacement={optionTooltipPlacement}
            placeholder={placeholder}
            placement={placement}
            readOnly={readOnly}
            stayOpenOnSelect={stayOpenOnSelect}
            tooltip={tooltip}
            tooltipPlacement={tooltipPlacement}
            onCancel={onCancel}
            onChange={onChangeHandler}
            onBlur={onBlurHandler}/>
    )
}

FormCombo.propTypes = {
    input: PropTypes.any.isRequired,
    options: PropTypes.any.isRequired,
    additionalButtons: PropTypes.any,
    alignment: PropTypes.any,
    allowClear: PropTypes.any,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.string,
    matchGroups: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    onCancel: PropTypes.func,
    onChange: PropTypes.func
}

FormCombo.defaultProps = {
    alignment: 'left',
    placement: 'below',
    tooltipPlacement: 'top'
}
