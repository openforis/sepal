import {Input, Textarea} from 'widget/input'
import {compose} from 'compose'
import {getErrorMessage} from 'widget/form/error'
import {withFormContext} from 'widget/form/context'
import PropTypes from 'prop-types'
import React from 'react'
import withForwardedRef from 'ref'

class _FormInput extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onBlur = this.onBlur.bind(this)
    }

    render() {
        const {textArea} = this.props
        return textArea ? this.renderTextArea() : this.renderInput()
    }

    renderInput() {
        const {form, forwardedRef, className, input, errorMessage, busyMessage, type, tabIndex, additionalButtons, ...props} = this.props
        return (
            <Input
                {...props}
                ref={forwardedRef}
                className={className}
                type={type}
                name={input && input.name}
                value={this.getValue()}
                errorMessage={getErrorMessage(form, errorMessage === true ? input : errorMessage)}
                busyMessage={busyMessage}
                tabIndex={tabIndex}
                additionalButtons={additionalButtons}
                onChange={this.onChange}
                onBlur={this.onblur}
            />
        )
    }

    getValue() {
        const {input} = this.props
        return typeof input.value === 'number' || typeof input.value === 'boolean' || input.value
            ? input.value
            : ''
    }

    renderTextArea() {
        const {form, forwardedRef, className, input, errorMessage, busyMessage, minRows, maxRows, tabIndex, ...props} = this.props
        return (
            <Textarea
                {...props}
                ref={forwardedRef}
                className={className}
                name={input.name}
                value={input.value || ''}
                errorMessage={getErrorMessage(form, errorMessage === true ? input : errorMessage)}
                busyMessage={busyMessage}
                tabIndex={tabIndex}
                minRows={minRows}
                maxRows={maxRows}
                onChange={this.onChange}
                onBlur={this.onBlur}
            />
        )
    }

    onChange(e) {
        const {input, validate, onChange} = this.props
        input.handleChange(e)
        onChange && onChange(e)
        validate === 'onChange' && input.validate()
    }

    onBlur(e) {
        const {input, validate, onBlur} = this.props
        onBlur && onBlur(e)
        validate === 'onBlur' && input.validate()
    }

}
export const FormInput = compose(
    _FormInput,
    withFormContext(),
    withForwardedRef()
)

FormInput.propTypes = {
    input: PropTypes.object.isRequired,
    additionalButtons: PropTypes.arrayOf(PropTypes.node),
    autoCapitalize: PropTypes.any,
    autoComplete: PropTypes.any,
    autoCorrect: PropTypes.any,
    autoFocus: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    errorMessage: PropTypes.any,
    inputTooltip: PropTypes.any,
    inputTooltipPlacement: PropTypes.string,
    label: PropTypes.string,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    placeholder: PropTypes.any,
    spellCheck: PropTypes.any,
    tabIndex: PropTypes.number,
    textArea: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    tooltipTrigger: PropTypes.string,
    type: PropTypes.string,
    validate: PropTypes.oneOf(['onChange', 'onBlur']),
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    onChangeDebounced: PropTypes.func
}

FormInput.defaultProps = {
    validate: 'onBlur'
}
