import {Buttons} from './buttons'
import {Form} from './form/form'
import {Widget} from './widget'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

export const NumberButtons = ({input, options, label, placeholder, tooltip, suffix, errorMessage}) =>
    <Widget
        layout='horizontal'
        spacing='compact'
        label={label}
        tooltip={tooltip}>
        <Buttons
            options={options}
            spacing='none'
            selected={Number(input.value)}
            onChange={value => input.set(value)}
        />
        <Form.Input
            input={input}
            type='number'
            suffix={suffix}
            placeholder={placeholder}
            onChange={element => {
                const value = parseFloat(element.target.value)
                _.isFinite(value) && input.set(value)
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
    tooltip: PropTypes.any
}
