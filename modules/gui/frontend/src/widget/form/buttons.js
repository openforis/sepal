import {Buttons} from 'widget/buttons'
import PropTypes from 'prop-types'
import React from 'react'

export const FormButtons = (
    {
        capitalized, className, input, label, multiple, options, tooltip, tooltipPlacement, type, disabled, onChange
    }) =>
    <Buttons
        capitalized={capitalized}
        className={className}
        selected={input.value}
        onChange={value => {
            input.set(value)
            onChange && onChange(value)
        }}
        label={label}
        multiple={multiple}
        options={options}
        tooltip={tooltip}
        tooltipPlacement={tooltipPlacement}
        type={type}
        disabled={disabled}/>

FormButtons.propTypes = {
    capitalized: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    input: PropTypes.object,
    label: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    onChange: PropTypes.any,
}
