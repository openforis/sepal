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
    state = {
        value: '',
        focused: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    componentDidMount() {
        const {value} = this.props
        const start = value.length
        const end = value.length
        this.setState({start, end})
    }

    componentDidUpdate(prevProps, prevState) {
        const {value} = this.props
        const {start, end} = this.state
        this.ref.current.value = value
        if (prevState.start !== start) {
            this.ref.current.selectionStart = start
        }
        if (prevState.end !== end) {
            this.ref.current.selectionEnd = end
        }
    }

    moveCursorToEnd() {
        const el = this.ref.current
        if (typeof el.selectionStart == 'number') {
            el.selectionStart = el.selectionEnd = el.value.length
        } else if (typeof el.createTextRange != 'undefined') {
            el.focus()
            var range = el.createTextRange()
            range.collapse(false)
            range.select()
        }
    }

    render() {
        const {className, disabled, label, tooltip, tooltipPlacement, errorMessage, busyMessage, border, onClick} = this.props
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
                busyMessage={busyMessage}
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
            type, name, placeholder, maxLength, tabIndex,
            autoFocus, autoComplete, autoCorrect, autoCapitalize, spellCheck, disabled, readOnly, transform,
            onBlur, onChange, onFocus
        } = this.props
        const {focused} = this.state
        const {value} = this.props
        return (
            // [HACK] input is wrapped in a div for fixing Firefox input width in flex
            <Keybinding keymap={{' ': null}} disabled={!focused} priority>
                <div className={styles.inputWrapper}>
                    <input
                        ref={this.ref}
                        className={readOnly ? styles.readOnly : null}
                        type={this.isSearchInput() ? 'text' : type}
                        name={name}
                        defaultValue={value}
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
                        onFocus={e => {
                            this.setState({focused: true})
                            onFocus && onFocus(e)
                        }}
                        onBlur={e => {
                            this.setState({focused: false})
                            onBlur && onBlur(e)
                        }}
                        onChange={e => {
                            const value = transform
                                ? transform(e.target.value)
                                : e.target.value
                            const start = e.target.selectionStart
                            const end = e.target.selectionEnd
                            e.target.value = value
                            onChange && onChange(e)
                            this.setState({start, end})
                        }}
                    />
                </div>
            </Keybinding>
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
                    air='none'
                    icon='times'
                    iconFixedWidth
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
    busyMessage: PropTypes.string,
    className: PropTypes.string,
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
    transform: PropTypes.func,
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
        focused: false,
        start: null,
        end: null
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    render() {
        const {className, disabled, label, tooltip, tooltipPlacement, errorMessage, busyMessage, border} = this.props
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
                busyMessage={busyMessage}
                border={border}>
                {this.renderTextArea()}
            </Widget>
        )
    }

    renderTextArea() {
        const {className, name, value, autoFocus, tabIndex, minRows, maxRows, onChange, onBlur, onFocus} = this.props
        const {focused} = this.state
        return (
            <Keybinding keymap={{Enter: null, ' ': null}} disabled={!focused} priority>
                <TextareaAutosize
                    ref={this.element}
                    className={className}
                    name={name}
                    value={value || ''}
                    tabIndex={tabIndex}
                    autoFocus={autoFocus && !isMobile()}
                    minRows={minRows}
                    maxRows={maxRows}
                    onFocus={e => {
                        this.setState({focused: true})
                        onFocus && onFocus(e)
                    }}
                    onBlur={e => {
                        this.setState({focused: false})
                        onBlur && onBlur(e)
                    }}
                    onChange={e => onChange && onChange(e)}
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
    busyMessage: PropTypes.string,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.string,
    label: PropTypes.any,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    onFocuse: PropTypes.func
}

Textarea.defaultProps = {
    autoFocus: false,
    border: true
}
