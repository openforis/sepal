import {Button} from 'widget/button'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import styles from './input.module.css'
import withForwardedRef from 'ref'

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
        const {className, disabled, label, tooltip, tooltipPlacement, errorMessage, border, onClick} = this.props
        return (
            <Widget
                className={[
                    styles.input,
                    className
                ].join(' ')}
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage}
                border={border}
                onClick={e => onClick && onClick(e)}
            >
                {this.renderContent()}
            </Widget>
        )
    }

    renderContent() {
        const {leftComponent, rightComponent} = this.props
        return leftComponent || rightComponent
            ? (
                <Layout type='horizontal-nowrap' spacing='none'>
                    {this.renderLeftComponent()}
                    {this.renderInput()}
                    {this.renderRightComponent()}
                </Layout>
            )
            : this.renderInput()
    }

    renderInput() {
        const {
            type, name, value, defaultValue, placeholder, maxLength, tabIndex,
            autoFocus, autoComplete, autoCorrect, autoCapitalize, spellCheck, disabled, readOnly,
            onBlur, onChange, onFocus
        } = this.props
        return (
            <input
                ref={this.ref}
                className={readOnly ? styles.readOnly : null}
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

class _Textarea extends React.Component {
    state = {
        textareaFocused: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    render() {
        const {className, disabled, label, tooltip, tooltipPlacement, errorMessage, border} = this.props
        return (
            <Widget
                className={[
                    styles.input,
                    className
                ].join(' ')}
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage}
                border={border}>
                {this.renderTextArea()}
            </Widget>
        )
    }

    renderTextArea() {
        const {className, name, value, autoFocus, tabIndex, minRows, maxRows, onChange, onBlur} = this.props
        const {textareaFocused} = this.state
        return (
            <Keybinding keymap={{Enter: null}} disabled={!textareaFocused} priority>
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
    disabled: Widget.propTypes.disabled,
    errorMessage: Widget.propTypes.errorMessage,
    label: Widget.propTypes.label,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    tooltip: Widget.propTypes.tooltip,
    tooltipPlacement: Widget.propTypes.tooltipPlacement,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func
}

Textarea.defaultProps = {
    autoFocus: false,
    border: true
}
