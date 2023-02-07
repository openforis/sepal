import {Button} from 'widget/button'
import {ButtonGroup} from './buttonGroup'
import {Layout} from 'widget/layout'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import Icon from './icon'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import Tooltip from 'widget/tooltip'
import styles from './input.module.css'
import withForwardedRef from 'ref'

const checkProtectedKey = (e, protectedKeyCodes) => {
    if (protectedKeyCodes.includes(e.code)) {
        e.stopPropagation()
    }
}

class _Input extends React.Component {
    state = {
        value: '',
        focused: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.onFocus = this.onFocus.bind(this)
        this.onBlur = this.onBlur.bind(this)
        this.onChange = this.onChange.bind(this)
        this.onClear = this.onClear.bind(this)
    }

    checkProtectedKey(e) {
        return checkProtectedKey(e, ['ArrowLeft', 'ArrowRight', 'Home', 'End'])
    }

    render() {
        const {className, disabled, label, tooltip, tooltipPlacement, tooltipTrigger, errorMessage, busyMessage, border, onClick} = this.props
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
                tooltipTrigger={tooltipTrigger}
                errorMessage={errorMessage}
                busyMessage={busyMessage}
                border={border}
                onClick={e => {
                    this.ref.current && this.ref.current.focus()
                    onClick && onClick(e)
                }}
            >
                {this.renderContent()}
            </Widget>
        )
    }

    renderContent() {
        return (
            <Layout type='horizontal-nowrap' spacing='none'>
                {this.renderSearch()}
                {this.renderPrefix()}
                {this.renderInput()}
                {this.renderSuffix()}
                {this.renderButtons()}
            </Layout>
        )
    }

    renderInput() {
        const {
            type, name, placeholder, maxLength, tabIndex,
            autoFocus, autoComplete, autoCorrect, autoCapitalize,
            spellCheck, disabled, readOnly, value,
            inputTooltip, inputTooltipPlacement
        } = this.props
        const {focused} = this.state
        return (
            <Keybinding keymap={{' ': null}} disabled={!focused} priority>
                {/* [HACK] input is wrapped in a div for fixing Firefox input width in flex */}
                {/* <div className={styles.inputWrapper}> */}
                <Tooltip
                    msg={inputTooltip}
                    placement={inputTooltipPlacement}
                    trigger='focus'>
                    <input
                        ref={this.ref}
                        type={this.isSearchInput() ? 'text' : type}
                        name={name}
                        value={value}
                        placeholder={placeholder}
                        maxLength={maxLength}
                        tabIndex={disabled || readOnly ? -1 : tabIndex}
                        autoFocus={autoFocus && !isMobile()}
                        autoComplete={autoComplete ? 'on' : 'off'}
                        autoCorrect={autoCorrect ? 'on' : 'off'}
                        autoCapitalize={autoCapitalize ? 'on' : 'off'}
                        spellCheck={spellCheck ? 'true' : 'false'}
                        disabled={disabled}
                        readOnly={readOnly ? 'readonly' : ''}
                        onFocus={this.onFocus}
                        onBlur={this.onBlur}
                        onChange={this.onChange}
                        onWheel={e => type === 'number' && e.target.blur()} // disable mouse wheel on input type=number
                        onKeyDown={e => this.checkProtectedKey(e)}
                    />
                </Tooltip>
                {/* </div> */}
            </Keybinding>
        )
    }

    onFocus(e) {
        const {onFocus} = this.props
        this.setState({focused: true})
        onFocus && onFocus(e)
    }

    onBlur(e) {
        const {onBlur} = this.props
        this.setState({focused: false})
        onBlur && onBlur(e)
    }

    onChange(e) {
        const {onChange} = this.props
        onChange && onChange(e)
    }

    renderSearch() {
        return this.isSearchInput()
            ? (
                <div className={[styles.search, styles.dim].join(' ')}>
                    <Icon name='search'/>
                </div>
            )
            : null
    }

    renderPrefix() {
        const {prefix} = this.props
        return prefix
            ? (
                <div className={[styles.prefix, styles.dim].join(' ')}>
                    {prefix}
                </div>
            )
            : null
    }

    renderSuffix() {
        const {suffix} = this.props
        return suffix
            ? (
                <div className={[styles.suffix, styles.dim].join(' ')}>
                    {suffix}
                </div>
            )
            : null
    }

    renderButtons() {
        const {value, additionalButtons, buttons} = this.props
        return value && this.isSearchInput()
            ? this.renderClearButton()
            : additionalButtons || buttons
                ? (
                    <ButtonGroup layout='horizontal-nowrap'>
                        <ButtonGroup layout='horizontal-nowrap'>
                            {additionalButtons}
                        </ButtonGroup>
                        <ButtonGroup layout='horizontal-nowrap' contentClassName={styles.dim}>
                            {buttons}
                        </ButtonGroup>
                    </ButtonGroup>
                )
                : null
    }

    renderClearButton() {
        return (
            <ButtonGroup layout='horizontal-nowrap'>
                <Button
                    chromeless
                    shape='none'
                    air='none'
                    icon='times'
                    iconAttributes={{
                        fixedWidth: true
                    }}
                    onClick={this.onClear}
                    // [TODO] change signature from event to value
                />
            </ButtonGroup>
        )
    }

    onClear() {
        const {onChange} = this.props
        const {ref} = this
        onChange({target: {value: ''}})
        ref.current.focus()
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
    additionalButtons: PropTypes.arrayOf(PropTypes.node),
    autoCapitalize: PropTypes.any,
    autoComplete: PropTypes.any,
    autoCorrect: PropTypes.any,
    autoFocus: PropTypes.any,
    border: PropTypes.any,
    busyMessage: PropTypes.any,
    buttons: PropTypes.arrayOf(PropTypes.node),
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.string,
    fadeOverflow: PropTypes.any,
    inputTooltip: PropTypes.any,
    inputTooltipPlacement: PropTypes.string,
    label: PropTypes.string,
    maxLength: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.any,
    prefix: PropTypes.any,
    readOnly: PropTypes.any,
    spellCheck: PropTypes.any,
    suffix: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    tooltipTrigger: PropTypes.string,
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
        focused: false
    }

    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
    }

    checkProtectedKey(e) {
        return checkProtectedKey(e, ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'])
    }

    render() {
        const {className, disabled, label, tooltip, tooltipPlacement, tooltipTrigger, errorMessage, busyMessage, border} = this.props
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
                tooltipTrigger={tooltipTrigger}
                errorMessage={errorMessage}
                busyMessage={busyMessage}
                framed
                border={border}>
                {this.renderTextArea()}
            </Widget>
        )
    }

    renderTextArea() {
        const {className, name, value, placeholder, autoFocus, inputTooltip, inputTooltipPlacement, tabIndex, disabled, minRows, maxRows, onChange, onBlur, onFocus} = this.props
        const {focused} = this.state
        return (
            <Keybinding keymap={{Enter: null, ' ': null}} disabled={!focused} priority>
                <Tooltip
                    msg={inputTooltip}
                    placement={inputTooltipPlacement}
                    trigger='focus'>
                    <TextareaAutosize
                        ref={this.element}
                        className={className}
                        name={name}
                        value={typeof value === 'number' || typeof value === 'boolean' || value
                            ? value
                            : ''}
                        placeholder={placeholder}
                        tabIndex={tabIndex}
                        disabled={disabled}
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
                        onKeyDown={e => this.checkProtectedKey(e)}
                    />
                </Tooltip>
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
    inputTooltip: PropTypes.any,
    inputTooltipPlacement: PropTypes.string,
    label: PropTypes.any,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.any,
    tooltipTrigger: PropTypes.any,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func,
    onFocuse: PropTypes.func
}

Textarea.defaultProps = {
    autoFocus: false,
    border: true
}
