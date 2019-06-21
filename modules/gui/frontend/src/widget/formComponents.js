import {Button} from 'widget/button'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import Keybinding from 'widget/keybinding'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import styles from './formComponents.module.css'
import withForwardedRef from 'ref'

export class FormComponent extends React.Component {
    render() {
        const {layout, spacing, errorMessage, className, children} = this.props
        return (
            <React.Fragment>
                <div className={[
                    styles.formComponentContainer,
                    className
                ].join(' ')}>
                    {this.renderLabel()}
                    <div className={[
                        styles.formComponent,
                        layout.split('-').map(className => styles[className]).join(' '),
                        styles[spacing],
                        errorMessage ? styles.error : null
                    ].join(' ')}>
                        {children}
                    </div>
                    {this.renderErrorMessage()}
                </div>
                {this.renderErrorMessageSpacer()}
            </React.Fragment>
        )
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement, alignment, disabled} = this.props
        return label
            ? (
                <Label
                    alignment={alignment}
                    msg={label}
                    tooltip={tooltip}
                    tooltipPlacement={tooltipPlacement}
                    disabled={disabled}
                    tabIndex={-1}
                />
            )
            : null
    }

    renderErrorMessage() {
        const {errorMessage} = this.props
        return errorMessage
            ? (
                <div className={styles.errorMessageContainer}>
                    <div className={styles.errorMessage}>
                        {errorMessage}
                    </div>
                </div>
            )
            : null
    }

    renderErrorMessageSpacer() {
        const {errorMessage} = this.props
        return errorMessage === undefined || errorMessage === false
            ? null
            : <div/>
    }
}

FormComponent.propTypes = {
    children: PropTypes.any.isRequired,
    alignment: PropTypes.oneOf(['left', 'center', 'right']),
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.string,
    layout: PropTypes.oneOf(['vertical', 'horizontal', 'horizontal-nowrap']),
    spacing: PropTypes.oneOf(['normal', 'compact', 'none']),
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}

FormComponent.defaultProps = {
    alignment: 'left',
    layout: 'vertical',
    spacing: 'none',
    tooltipPlacement: 'top'
}

class _Input extends React.Component {
    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    state = {
        value: null
    }

    static getDerivedStateFromProps(props) {
        const {value} = props
        return {
            value
        }
    }

    render() {
        const {className, disabled, label, tooltip, tooltipPlacement, errorMessage, border} = this.props
        return (
            <FormComponent
                className={className}
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage}>
                <FormComponent
                    className={[
                        styles.input,
                        border ? styles.border : null
                    ].join(' ')}
                    layout='horizontal-nowrap'
                    spacing='compact'>
                    {this.renderLeftComponent()}
                    {this.renderInput()}
                    {this.renderRightComponent()}
                </FormComponent>
            </FormComponent>
        )
    }

    renderInput() {
        const {
            type, name, value, defaultValue, placeholder, maxLength, tabIndex,
            autoFocus, autoComplete, autoCorrect, autoCapitalize, spellCheck, disabled, readOnly,
            onBlur, onClick, onChange, onFocus
        } = this.props
        return (
            <input
                ref={this.ref}
                type={this.isSearchInput() ? 'text' : type}
                name={name}
                value={value}
                defaultValue={defaultValue}
                placeholder={placeholder}
                maxLength={maxLength}
                tabIndex={tabIndex}
                autoFocus={autoFocus && !isMobile()}
                autoComplete={autoComplete ? 'on' : 'off'}
                autoCorrect={autoCorrect ? 'on' : 'off'}
                autoCapitalize={autoCapitalize ? 'on' : 'off'}
                spellCheck={spellCheck ? 'true' : 'false'}
                disabled={disabled}
                readOnly={readOnly ? 'readonly' : ''}
                onBlur={e => onBlur && onBlur(e)}
                onClick={e => onClick && onClick(e)}
                onChange={e => onChange && onChange(e)}
                onFocus={e => onFocus && onFocus(e)}
            />
        )
    }

    renderLeftComponent() {
        const {leftComponent} = this.props
        return leftComponent
            ? (
                <div className={[styles.extraComponent, styles.left].join(' ')}>
                    {leftComponent}
                </div>
            )
            : null
    }

    renderRightComponent() {
        const {value, rightComponent} = this.props
        return value && this.isSearchInput()
            ? this.renderClearButton()
            : rightComponent
                ? (
                    <div className={[styles.extraComponent, styles.right].join(' ')}>
                        {rightComponent}
                    </div>
                )
                : null
    }

    renderClearButton() {
        return (
            <div className={[styles.extraComponent, styles.right].join(' ')}>
                <Button
                    chromeless
                    shape='none'
                    icon='times'
                    onClick={() => this.props.onChange({target: {value: ''}})}
                    // [TODO] change signature from event to value
                />
            </div>
        )
    }

    isSearchInput() {
        const {type} = this.props
        return type === 'search'
    }
}

export const Input = compose(
    _Input,
    withForwardedRef()
)

Input.propTypes = {
    autoCapitalize: PropTypes.any,
    autoComplete: PropTypes.any,
    autoCorrect: PropTypes.any,
    autoFocus: PropTypes.any,
    border: PropTypes.any,
    className: PropTypes.string,
    defaultValue: PropTypes.any,
    disabled: PropTypes.any,
    errorMessage: PropTypes.string,
    fadeOverflow: PropTypes.any,
    label: PropTypes.string,
    leftComponent: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
    maxLength: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.any,
    readOnly: PropTypes.any,
    rightComponent: PropTypes.oneOfType([PropTypes.func, PropTypes.object]),
    spellCheck: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    onClick: PropTypes.func,
    onFocus: PropTypes.func
}

Input.defaultProps = {
    autoFocus: false,
    autoComplete: false,
    autoCorrect: false,
    autoCapitalize: false,
    border: true,
    spellCheck: false,
    type: 'text',
    tooltipPlacement: 'top'
}

export class _Textarea extends React.Component {
    state = {
        textareaFocused: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    render() {
        const {disabled, label, tooltip, tooltipPlacement, errorMessage} = this.props
        return (
            <FormComponent
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage}>
                {this.renderTextArea()}
            </FormComponent>
        )
    }

    renderTextArea() {
        const {className, name, value, autoFocus, tabIndex, minRows, maxRows, onChange, onBlur} = this.props
        const {textareaFocused} = this.state
        return (
            <Keybinding keymap={{Enter: null}} disabled={!textareaFocused} priority>
                <div className={styles.input}>
                    <TextareaAutosize
                        ref={this.element}
                        className={className}
                        name={name}
                        value={value || ''}
                        tabIndex={tabIndex}
                        autoFocus={autoFocus && !isMobile()}
                        minRows={minRows}
                        maxRows={maxRows}
                        onChange={e => onChange && onChange(e)}
                        onFocus={() => this.setState({textareaFocused: true})}
                        onBlur={e => {
                            this.setState({textareaFocused: false})
                            onBlur && onBlur(e)
                        }}
                    />
                </div>
            </Keybinding>
        )
    }
}

export const Textarea = compose(
    _Textarea,
    withForwardedRef()
)

Textarea.propTypes = {
    autoFocus: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.string,
    label: PropTypes.string,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func
}

Textarea.defaultProp = {
    tooltipPlacement: 'top'
}

export default {
    FormComponent,
    Input,
    Textarea
}
