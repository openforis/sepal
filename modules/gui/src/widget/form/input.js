import {Input, Textarea} from 'widget/input'
import {Subject, debounceTime, distinctUntilChanged} from 'rxjs'
import {compose} from 'compose'
import {getErrorMessage} from 'widget/form/error'
import {withFormContext} from 'widget/form/context'
import PropTypes from 'prop-types'
import React from 'react'
import withForwardedRef from 'ref'
import withSubscriptions from 'subscription'

const DEBOUNCE_TIME_MS = 750

class _FormInput extends React.Component {
    constructor(props) {
        super(props)
        const {addSubscription, onChangeDebounced} = props
        this.change$ = new Subject()
        addSubscription(
            this.change$.pipe(
                debounceTime(DEBOUNCE_TIME_MS),
                distinctUntilChanged()
            ).subscribe(
                value => onChangeDebounced && onChangeDebounced(value)
            )
        )
    }

    render() {
        const {textArea} = this.props
        return textArea ? this.renderTextArea() : this.renderInput()
    }

    renderInput() {
        const {form, forwardedRef, className, input, errorMessage, busyMessage, type, validate, tabIndex, onChange, onBlur, additionalButtons, ...props} = this.props
        return (
            <Input
                {...props}
                ref={forwardedRef}
                className={className}
                type={type}
                name={input && input.name}
                value={typeof input.value === 'number' || typeof input.value === 'boolean' || input.value
                    ? input.value
                    : ''
                }
                errorMessage={getErrorMessage(form, errorMessage === true ? input : errorMessage)}
                busyMessage={busyMessage}
                tabIndex={tabIndex}
                additionalButtons={additionalButtons}
                onChange={e => {
                    input.handleChange(e)
                    this.change$.next(e.target.value)
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
        const {form, forwardedRef, className, input, errorMessage, busyMessage, minRows, maxRows, validate, tabIndex, onChange, onBlur, ...props} = this.props
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
    withFormContext(),
    withSubscriptions(),
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
