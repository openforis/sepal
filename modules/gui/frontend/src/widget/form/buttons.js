import {Buttons} from 'widget/buttons'
import PropTypes from 'prop-types'
import React from 'react'

export const FormButtons = (
    {
        chromeless, look, shape, air, className, input, label, multiple, options, tooltip, tooltipPlacement, layout, disabled, onChange
    }) =>
    <Buttons
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
        layout={layout}
        disabled={disabled}/>

FormButtons.propTypes = {
    air: PropTypes.any,
    chromeless: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    input: PropTypes.object,
    label: PropTypes.string,
    layout: PropTypes.string,
    look: PropTypes.string,
    multiple: PropTypes.any,
    options: PropTypes.array,
    shape: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    onChange: PropTypes.any
}
