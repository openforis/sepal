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

    componentDidMount() {
        const {value} = this.props
        const start = value.length
        const end = value.length
        this.setState({start, end})
    }

    componentDidUpdate(prevProps, prevState) {
        const {value} = this.props
        const input = this.ref.current
        input.value = value
        if (this.isSelectionAllowed()) {
            const {start, end} = this.state
            if (prevState.start !== start && input.selectionStart !== start) {
                input.selectionStart = start
            }
            if (prevState.end !== end && input.selectionEnd !== end) {
                input.selectionEnd = end
            }
        }
    }

    isSelectionAllowed() {
        const input = this.ref.current
        return input && /text|search|password|tel|url/.test(input.type)
    }

    moveCursorToEnd() {
        const el = this.ref.current
        if (typeof el.selectionStart === 'number') {
            el.selectionStart = el.selectionEnd = el.value.length
        } else if (typeof el.createTextRange != 'undefined') {
            el.focus()
            var range = el.createTextRange()
            range.collapse(false)
            range.select()
        }
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
        const {buttons} = this.props
        return this.isSearchInput() || buttons
            ? (
                <Layout type='horizontal-nowrap' spacing='none'>
                    {this.renderLeftComponent()}
                    {this.renderInput()}
                    {this.renderbuttons()}
                </Layout>
            )
            : this.renderInput()
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
                        onFocus={this.onFocus}
                        onBlur={this.onBlur}
                        onChange={this.onChange}
                        onWheel={e => type === 'number' && e.target.blur()} // disable mouse wheel on input type=number
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
        const {transform, onChange} = this.props
        const value = transform
            ? transform(e.target.value)
            : e.target.value

        if (this.isSelectionAllowed()) {
            const start = e.target.selectionStart
            const end = e.target.selectionEnd
            this.setState({start, end})
        }
        e.target.value = value
        onChange && onChange(e)
    }

    renderLeftComponent() {
        return this.isSearchInput()
            ? (
                <div className={[styles.search, styles.dim].join(' ')}>
                    <Icon name='search'/>
                </div>
            )
            : null
    }

    renderbuttons() {
        const {value, additionalButtons, buttons} = this.props
        return value && this.isSearchInput()
            ? this.renderClearButton()
            : additionalButtons || buttons
                ? (
                    <ButtonGroup layout='horizontal-nowrap'>
                        <ButtonGroup layout='horizontal-nowrap'>
                            {additionalButtons}
                        </ButtonGroup>
                        <ButtonGroup layout='horizontal-nowrap' className={styles.dim}>
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
                    iconFixedWidth
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
    readOnly: PropTypes.any,
    spellCheck: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    tooltipTrigger: PropTypes.string,
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
                        value={value || ''}
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
