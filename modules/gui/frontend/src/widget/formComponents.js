import {isMobile} from 'widget/userAgent'
import Keybinding from 'widget/keybinding'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import TextareaAutosize from 'react-textarea-autosize'
import _ from 'lodash'
import styles from './formComponents.module.css'

export class FormComponent extends React.Component {
    render() {
        const {layout, spacing, errorMessage, className, children} = this.props
        return (
            <React.Fragment>
                <div>
                    {this.renderLabel()}
                    <div className={[
                        styles.formComponent,
                        styles[layout],
                        styles[spacing],
                        errorMessage ? styles.error : null,
                        className
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
        return label ? (
            <Label
                className={[styles.alignment, styles[alignment]].join(' ')}
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                tabIndex={-1}
            />
        ) : null
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
    layout: PropTypes.oneOf(['vertical', 'horizontal']),
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

export class Input extends React.Component {
    element = React.createRef()

    render() {
        const {disabled, label, tooltip, tooltipPlacement, errorMessage} = this.props
        return (
            <FormComponent
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage}>
                {this.renderInput()}
            </FormComponent>
        )
    }

    renderInput() {
        const {
            className, type, name, value, tabIndex,
            autoFocus, autoComplete, autoCorrect, autoCapitalize, spellCheck,
            onChange, onBlur, ...props
        } = this.props
        const extraProps = _.omit(props, ['errorMessage'])
        return (
            <input
                ref={this.element}
                className={className}
                type={type}
                name={name}
                value={value}
                tabIndex={tabIndex}
                autoFocus={autoFocus && !isMobile()}
                autoComplete={autoComplete ? 'on' : 'off'}
                autoCorrect={autoCorrect ? 'on' : 'off'}
                autoCapitalize={autoCapitalize ? 'on' : 'off'}
                spellCheck={spellCheck ? 'true' : 'false'}
                onChange={e => onChange && onChange(e)}
                onBlur={e => onBlur && onBlur(e)}
                {...extraProps}
            />
        )
    }
}

Input.propTypes = {
    autoCapitalize: PropTypes.any,
    autoComplete: PropTypes.any,
    autoCorrect: PropTypes.any,
    autoFocus: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.string,
    label: PropTypes.string,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    name: PropTypes.string,
    placeholder: PropTypes.string,
    spellCheck: PropTypes.any,
    tabIndex: PropTypes.number,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
    type: PropTypes.string,
    value: PropTypes.any,
    onBlur: PropTypes.func,
    onChange: PropTypes.func
}

Input.defaultProp = {
    type: 'text',
    autoFocus: false,
    autoComplete: false,
    autoCorrect: false,
    autoCapitalize: false,
    spellCheck: false,
    tooltipPlacement: 'top'
}

export class Textarea extends React.Component {
    element = React.createRef()
    state = {
        textareaFocused: false
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
        const {className, name, value, tabIndex, minRows, maxRows, onChange, onBlur} = this.props
        const {textareaFocused} = this.state
        return (
            <Keybinding keymap={{Enter: null}} disabled={!textareaFocused} priority>
                <TextareaAutosize
                    ref={this.element}
                    className={className}
                    name={name}
                    value={value || ''}
                    tabIndex={tabIndex}
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

Textarea.propTypes = {
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
