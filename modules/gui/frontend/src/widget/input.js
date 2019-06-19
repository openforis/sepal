import {compose} from 'compose'
import {getErrorMessage, withFormContext} from 'widget/form'
import FormComponents from 'widget/formComponents'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class _Input extends React.Component {
    render() {
        const {textArea} = this.props
        return textArea ? this.renderTextArea() : this.renderInput()
    }

    renderInput() {
        const {form, className, input, errorMessage, type, validate = 'onBlur', tabIndex, onChange, onBlur, ...props} = this.props
        return (
            <FormComponents.Input
                {...props}
                className={className}
                type={type}
                name={input && input.name}
                errorMessage={errorMessage && getErrorMessage(form, input)}
                value={typeof input.value === 'number' || typeof input.value === 'boolean' || input.value
                    ? input.value
                    : ''
                }
                tabIndex={tabIndex}
                onChange={e => {
                    input.handleChange(e)
                    onChange && onChange(e)
                    validate === 'onChange' && input.validate()
                }}
                onBlur={e => {
                    onBlur && onBlur(e)
                    validate === 'onBlur' && input.validate()
                }}
            />
        )
    }

    renderTextArea() {
        const {form, className, input, errorMessage, minRows, maxRows, validate = 'onBlur', tabIndex, onChange, onBlur, ...props} = this.props
        return (
            <FormComponents.Textarea
                {...props}
                className={className}
                name={input.name}
                errorMessage={errorMessage && getErrorMessage(form, input)}
                value={input.value || ''}
                tabIndex={tabIndex}
                minRows={minRows}
                maxRows={maxRows}
                onChange={e => {
                    input && input.handleChange(e)
                    onChange && onChange(e)
                    input && validate === 'onChange' && input.validate()
                }}
                onBlur={e => {
                    onBlur && onBlur(e)
                    input && validate === 'onBlur' && input.validate()
                }}
            />
        )
    }
}

export const Input = compose(
    _Input,
    withFormContext()
)

Input.propTypes = {
    input: PropTypes.object.isRequired,
    autoCapitalize: PropTypes.any,
    autoComplete: PropTypes.any,
    autoCorrect: PropTypes.any,
    autoFocus: PropTypes.any,
    className: PropTypes.string,
    errorMessage: PropTypes.any,
    label: PropTypes.string,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    placeholder: PropTypes.string,
    spellCheck: PropTypes.any,
    tabIndex: PropTypes.number,
    textArea: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    validate: PropTypes.oneOf(['onChange', 'onBlur']),
    onBlur: PropTypes.func,
    onChange: PropTypes.func
}
