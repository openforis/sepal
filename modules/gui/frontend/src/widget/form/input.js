import {Input, Textarea} from 'widget/input'
import {compose} from 'compose'
import {getErrorMessage} from 'widget/form/error'
import {withFormContext} from 'widget/form/context'
import PropTypes from 'prop-types'
import React from 'react'

class _FormInput extends React.Component {
    render() {
        const {textArea} = this.props
        return textArea ? this.renderTextArea() : this.renderInput()
    }

    renderInput() {
        const {form, className, input, errorMessage, type, validate, tabIndex, onChange, onBlur, ...props} = this.props
        return (
            <Input
                {...props}
                className={className}
                type={type}
                name={input && input.name}
                value={typeof input.value === 'number' || typeof input.value === 'boolean' || input.value
                    ? input.value
                    : ''
                }
                errorMessage={errorMessage && getErrorMessage(form, input)}
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
        const {form, className, input, errorMessage, minRows, maxRows, validate, tabIndex, onChange, onBlur, ...props} = this.props
        return (
            <Textarea
                {...props}
                className={className}
                name={input.name}
                value={input.value || ''}
                errorMessage={errorMessage && getErrorMessage(form, input)}
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
export const FormInput = compose(
    _FormInput,
    withFormContext()
)

FormInput.propTypes = {
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
    placeholder: PropTypes.any,
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

FormInput.defaultProps = {
    validate: 'onBlur'
}
