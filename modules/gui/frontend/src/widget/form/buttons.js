import {Buttons} from 'widget/buttons'
import PropTypes from 'prop-types'
import React from 'react'

export const FormButtons = (
    {
        capitalized, chromeless, look, shape, air, className, input, label, multiple, options, tooltip, tooltipPlacement, type, disabled, onChange
    }) =>
    <Buttons
        capitalized={capitalized}
        chromeless={chromeless}
        look={look}
        shape={shape}
        air={air}
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
    air: PropTypes.any,
    capitalized: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    input: PropTypes.object,
    label: PropTypes.string,
    look: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    shape: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    onChange: PropTypes.any,
}
