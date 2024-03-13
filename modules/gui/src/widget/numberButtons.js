import {Buttons} from './buttons'
import {Form} from './form'
import {Widget} from './widget'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export const NumberButtons = ({input, options, label, placeholder, tooltip, suffix, errorMessage, onChange}) =>
    <Widget
        layout='horizontal'
        spacing='compact'
        label={label}
        tooltip={tooltip}>
        <Buttons
            options={options}
            spacing='none'
            selected={Number(input.value)}
            onChange={value => {
                input.set(value)
                onChange && onChange(value)
            }}
        />
        <Form.Input
            input={input}
            type='number'
            suffix={suffix}
            placeholder={placeholder}
            onChange={value => {
                const numericValue = parseFloat(value)
                if (_.isFinite(numericValue)) {
                    input.set(numericValue)
                    onChange && onChange(numericValue)
                }
            }}
            errorMessage={errorMessage}
        />
    </Widget>

NumberButtons.propTypes = {
    input: PropTypes.object.isRequired,
    options: PropTypes.array.isRequired,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    placeholder: PropTypes.any,
    suffix: PropTypes.any,
    tooltip: PropTypes.any,
    onChange: PropTypes.func
}
