import {Buttons} from './buttons'
import {Form} from './form/form'
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
            onChange={element => {
                const value = parseFloat(element.target.value)
                if (_.isFinite(value)) {
                    input.set(value)
                    onChange && onChange(value)
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
    onChange: PropTypes.func,
    placeholder: PropTypes.any,
    suffix: PropTypes.any,
    tooltip: PropTypes.any
}
