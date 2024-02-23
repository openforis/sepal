import {Button} from 'widget/button'
import {ButtonGroup} from './buttonGroup'
import {Layout} from 'widget/layout'
import {Subject, debounceTime, distinctUntilChanged} from 'rxjs'
import {Widget} from 'widget/widget'
import {compose} from 'compose'
import {isMobile} from 'widget/userAgent'
import {withSubscriptions} from 'subscription'
import Icon from './icon'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import Tooltip from 'widget/tooltip'
import _ from 'lodash'
import styles from './input.module.css'
import withForwardedRef from 'ref'

const DEBOUNCE_TIME_MS = 750

const captureKeypress = (e, keyCodes) => {
    if (keyCodes.includes(e.code)) {
        e.stopPropagation()
    }
}

class _Input extends React.Component {
    constructor(props) {
        super(props)
        this.ref = props.forwardedRef || React.createRef()
        this.onClick = this.onClick.bind(this)
        this.onFocus = this.onFocus.bind(this)
        this.onBlur = this.onBlur.bind(this)
        this.onChange = this.onChange.bind(this)
        this.onClear = this.onClear.bind(this)
        this.onWheel = this.onWheel.bind(this)
        this.onAccept = this.onAccept.bind(this)
        this.onCancel = this.onCancel.bind(this)
        this.captureEvents = this.captureEvents.bind(this)
    }

    change$ = new Subject()

    state = {
        value: '',
        focused: false
    }

    captureEvents(e) {
        const {value} = this.state
        if (value.length) {
            captureKeypress(e, [
                'ArrowLeft',
                'ArrowRight',
                'Home',
                'End'
            ])
        }
    }

    render() {
        const {className, disabled, label, labelButtons, tooltip, tooltipPlacement, tooltipTrigger, errorMessage, busyMessage, border} = this.props
        return (
            <Widget
                className={[
                    styles.input,
                    className
                ].join(' ')}
                disabled={disabled}
                label={label}
                labelButtons={labelButtons}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                tooltipTrigger={tooltipTrigger}
                errorMessage={errorMessage}
                busyMessage={busyMessage}
                border={border}
                onClick={this.onClick}
            >
                {this.renderContent()}
            </Widget>
        )
    }

    onClick(e) {
        const {onClick} = this.props
        this.ref.current && this.ref.current.focus()
        onClick && onClick(e)
    }

    renderContent() {
        return (
            <Layout type='horizontal-nowrap' spacing='compact'>
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
            inputTooltip, inputTooltipPlacement, onAccept, onCancel
        } = this.props
        const {focused} = this.state
        const keymap = _.assign(
            {' ': null},
            onAccept ? {'Enter': this.onAccept} : undefined,
            onCancel ? {'Escape': this.onCancel} : undefined
        )
        return (
            <Keybinding keymap={keymap} disabled={!focused}>
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
                        onWheel={this.onWheel} // disable mouse wheel on input type=number
                        onKeyDown={this.captureEvents}
                    />
                </Tooltip>
                {/* </div> */}
            </Keybinding>
        )
    }

    onWheel(e) {
        const {type} = this.props
        type === 'number' && e.target.blur()
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
        this.change$.next(e.target.value)
        onChange && onChange(e)
    }

    onAccept() {
        const {onAccept} = this.props
        onAccept && onAccept(this.getCurrentValue())
    }

    onCancel() {
        const {onCancel} = this.props
        onCancel && onCancel()
    }

    getCurrentValue() {
        return this.ref?.current?.value
    }

    renderSearch() {
        return this.isSearchInput()
            ? (
                <Icon name='search' dimmed/>
            )
            : null
    }

    renderPrefix() {
        const {prefix} = this.props
        return prefix
            ? (
                <div className={styles.prefix}>
                    {prefix}
                </div>
            )
            : null
    }

    renderSuffix() {
        const {suffix} = this.props
        return suffix
            ? (
                <div className={styles.suffix}>
                    {suffix}
                </div>
            )
            : null
    }

    renderButtons() {
        const {value, buttons, onAccept, onCancel} = this.props
        return value && this.isSearchInput()
            ? this.renderClearButton()
            : buttons || onAccept || onCancel
                ? (
                    <ButtonGroup
                        layout='horizontal-nowrap'
                        dimmed>
                        {this.renderCancelButton()}
                        {this.renderAcceptButton()}
                        {buttons}
                    </ButtonGroup>
                )
                : null
    }

    renderClearButton() {
        return (
            <ButtonGroup
                layout='horizontal-nowrap'
                dimmed>
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

    renderCancelButton() {
        const {onCancel} = this.props
        return onCancel ? (
            <Button
                key='cancel'
                chromeless
                shape='none'
                air='none'
                icon='undo'
                onClick={this.onCancel}
            />
        ) : null
    }

    renderAcceptButton() {
        const {onAccept} = this.props
        return onAccept ? (
            <Button
                key='confirm'
                chromeless
                shape='none'
                air='none'
                icon='check'
                onClick={this.onAccept}
            />
        ) : null
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

    componentDidMount() {
        const {addSubscription, onChangeDebounced} = this.props
        if (onChangeDebounced) {
            addSubscription(
                this.change$.pipe(
                    debounceTime(DEBOUNCE_TIME_MS),
                    distinctUntilChanged()
                ).subscribe(
                    value => onChangeDebounced(value)
                )
            )
        }
    }
}

export const Input = compose(
    _Input,
    withSubscriptions(),
    withForwardedRef()
)

Input.propTypes = {
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
    labelButtons: PropTypes.any,
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
    onAccept: PropTypes.func,
    onBlur: PropTypes.func,
    onCancel: PropTypes.func,
    onChange: PropTypes.func,
    onChangeDebounced: PropTypes.func,
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
    constructor(props) {
        super(props)
        this.onFocus = this.onFocus.bind(this)
        this.onBlur = this.onBlur.bind(this)
        this.onChange = this.onChange.bind(this)
        this.captureEvents = this.captureEvents.bind(this)
        this.ref = props.forwardedRef || React.createRef()
    }

    change$ = new Subject()

    state = {
        focused: false
    }

    captureEvents(e) {
        captureKeypress(e, [
            'ArrowLeft',
            'ArrowRight',
            'ArrowUp',
            'ArrowDown',
            'Home',
            'End',
            'PageUp',
            'PageDown'
        ])
    }

    render() {
        const {className, disabled, label, labelButtons, tooltip, tooltipPlacement, tooltipTrigger, errorMessage, busyMessage, border} = this.props
        return (
            <Widget
                className={[
                    styles.input,
                    className
                ].join(' ')}
                disabled={disabled}
                label={label}
                labelButtons={labelButtons}
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
        const {className, name, value, placeholder, autoFocus, inputTooltip, inputTooltipPlacement, tabIndex, disabled, minRows, maxRows} = this.props
        const {focused} = this.state
        return (
            <Keybinding keymap={{Enter: null, ' ': null}} disabled={!focused}>
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
                        onFocus={this.onFocus}
                        onBlur={this.onBlur}
                        onChange={this.onChange}
                        onKeyDown={this.captureEvents}
                    />
                </Tooltip>
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
        this.change$.next(e.target.value)
        onChange && onChange(e)
    }

    componentDidMount() {
        const {addSubscription, onChangeDebounced} = this.props
        if (onChangeDebounced) {
            addSubscription(
                this.change$.pipe(
                    debounceTime(DEBOUNCE_TIME_MS),
                    distinctUntilChanged()
                ).subscribe(
                    value => onChangeDebounced(value)
                )
            )
        }
    }
}

export const Textarea = compose(
    _Textarea,
    withSubscriptions(),
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
    labelButtons: PropTypes.any,
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
    onChangeDebounced: PropTypes.func,
    onFocus: PropTypes.func
}

Textarea.defaultProps = {
    autoFocus: false,
    border: true
}
