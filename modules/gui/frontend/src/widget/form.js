import {compose} from 'compose'
import {connect} from 'store'
import {isMobile} from 'widget/userAgent'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import Label from 'widget/label'
import PropTypes from 'prop-types'
import React from 'react'
import Textarea from 'react-textarea-autosize'
import _ from 'lodash'
import moment from 'moment'
import styles from './form.module.css'

export const form = ({fields = {}, constraints = {}, mapStateToProps}) =>
    WrappedComponent => {
        class Form extends React.Component {
            dirtyListeners = []
            cleanListeners = []
            changeListenersByInputName = {}
            constraintNamesByFieldName = {}

            constructor(props) {
                super(props)
                const state = {
                    initialValues: {...props.values} || {},
                    values: {...props.values} || {},
                    errors: {...props.errors} || {},
                    invalidValue: {},
                    dirty: false,
                    gotDirty: {},
                    gotClean: {}
                }
                Object.keys(fields).forEach(name => {
                    state.initialValues[name] = name in state.initialValues ? state.initialValues[name] : ''
                    state.values[name] = name in state.values ? state.values[name] : ''
                    state.errors[name] = name in state.errors ? state.errors[name] : ''
                })
                this.state = state

                if (constraints) {
                    Object.keys(constraints).forEach(constraintName =>
                        constraints[constraintName].fieldNames.forEach(name => {
                            let constraintNames = this.constraintNamesByFieldName[name]
                            if (!constraintNames) {
                                constraintNames = []
                                this.constraintNamesByFieldName[name] = constraintNames
                            }
                            constraintNames.push(constraintName)
                        })
                    )
                }

                this.handleChange = this.handleChange.bind(this)
                this.value = this.value.bind(this)
                this.validateField = this.validateField.bind(this)
                this.isInvalid = this.isInvalid.bind(this)
            }

            componentDidMount() {
                this.onClean()
            }

            subscribe(description, stream$, observer) {
                this.props.subscribe(description, stream$, observer)
            }

            static getDerivedStateFromProps(props) {
                if ('errors' in props) {
                    return {
                        errors: props.errors
                    }
                }
                return null
            }

            handleChange(e) {
                const target = e.target
                const name = target.name
                const value = target.type === 'checkbox'
                    ? target.checked
                    : target.value
                this.set(name, value)
                return this
            }

            set(name, value) {
                const prevValue = this.state.values[name]
                if (value !== prevValue && !_.isEqual(value, prevValue))
                    this.setState(prevState => {
                        const state = _.cloneDeep(prevState)
                        state.values[name] = value
                        this.clearErrorsForField(name, state.errors)
                        state.invalidValue[name] = ''
                        state.dirty = !!Object.keys(state.initialValues)
                            .find(name =>
                                !_.isEqual(state.initialValues[name], state.values[name])
                            )
                        state.gotDirty[name] = state.gotDirty[name] || (state.dirty && !prevState.dirty)
                        state.gotClean[name] = state.gotClean[name] || (!state.dirty && prevState.dirty)
                        return state
                    }, () => this.notifyOnChange(name, value))
                return this
            }

            notifyOnChange(name, value) {
                const listeners = this.changeListenersByInputName[name] || []
                listeners.forEach(listener => listener(value))
                if (this.state.gotDirty[name]) {
                    this.onDirty()
                    this.setState(prevState => {
                        const state = _.cloneDeep(prevState)
                        state.gotDirty[name] = false
                        return state
                    })
                } else if (this.state.gotClean[name]) {
                    this.onClean()
                    this.setState(prevState => {
                        const state = _.cloneDeep(prevState)
                        state.gotClean[name] = false
                        return state
                    })
                }
            }

            value(name) {
                return this.state.values[name]
            }

            clearErrorsForField(name, errors) {
                errors[name] = ''
                const constraintNames = this.constraintNamesByFieldName[name] || []
                constraintNames.forEach(constraintName =>
                    errors[constraintName] = ''
                )
            }

            getConstraintErrorsForField(name) {
                return (this.constraintNamesByFieldName[name] || []).find(constraintName =>
                    this.state.errors[constraintName]
                )
            }

            checkFieldError(name) {
                let field = fields[name]
                return field ? field.check(name, this.state.values) : ''
            }

            checkConstraintError(name) {
                let constraint = constraints[name]
                return constraint ? constraint.check(name, this.state.values) : ''
            }

            validateField(name) {
                this.setState(prevState => {
                    const state = Object.assign({}, prevState)
                    if (!state.invalidValue[name])
                        state.errors[name] = this.checkFieldError(name)
                    const constraintNames = this.constraintNamesByFieldName[name]
                    constraintNames && constraintNames.forEach(constraintName =>
                        state.errors[constraintName] = this.checkConstraintError(constraintName)
                    )
                    return state
                })
                return this
            }

            isInvalid() {
                const hasInvalidField = !!Object.keys(this.state.values).find(name => this.checkFieldError(name))
                const hasInvalidConstraint = !!Object.keys(constraints).find(name => this.checkConstraintError(name))
                return hasInvalidField || hasInvalidConstraint
            }

            setInitialValues(values) {
                if (!values)
                    return
                this.setState(prevState => {
                    const state = {...prevState, dirty: false}
                    Object.keys(fields).forEach(name => {
                        state.initialValues[name] = name in values ? values[name] : ''
                        state.values[name] = name in values ? values[name] : ''
                        state.errors[name] = ''
                    })
                    if (prevState.dirty)
                        this.onClean()
                    return state
                })
            }

            setInitialValue(name, value) {
                this.setState(prevState => {
                    const state = {...prevState, dirty: false}
                    state.initialValues[name] = value
                    state.values[name] = value
                    state.errors[name] = ''
                    if (prevState.dirty)
                        this.onClean()
                    return state
                })
            }

            isValueDirty(name) {
                const state = this.state
                return !_.isEqual(state.values[name], state.initialValues[name])
            }

            isDirty() {
                return !!Object.keys(this.state.initialValues)
                    .find(name => this.isValueDirty(name))
            }

            onDirty() {
                this.dirtyListeners.forEach(listener => listener())
            }

            onClean() {
                this.cleanListeners.forEach(listener => listener())
            }

            render() {
                const inputs = {}
                Object.keys(fields).forEach(name => {
                    inputs[name] = {
                        name: name,
                        value: this.state.values[name],
                        error: this.state.errors[name],
                        validationFailed: !!this.state.errors[name] || !!this.getConstraintErrorsForField(name),
                        isInvalid: () => this.checkFieldError(name),
                        setInvalid: msg => this.setState(prevState => ({
                            ...prevState,
                            errors: {...prevState.errors, [name]: msg},
                            invalidValue: {...prevState.invalidValue, [name]: this.state.values[name]}
                        })),
                        validate: () => this.validateField(name),
                        isDirty: () => this.isValueDirty(name),
                        set: value => this.set(name, value),
                        setInitialValue: value => this.setInitialValue(name, value),
                        handleChange: e => this.handleChange(e),
                        onChange: listener => {
                            const listeners = this.changeListenersByInputName[name] || []
                            this.changeListenersByInputName[name] = listeners
                            listeners.push(listener)
                        }
                    }
                })
                const form = {
                    errors: this.state.errors,
                    isInvalid: this.isInvalid,
                    isDirty: () => this.isDirty(),
                    setInitialValues: values => this.setInitialValues(values),
                    values: () => this.state.values,
                    onDirty: listener => listener && this.dirtyListeners.push(listener),
                    onClean: listener => listener && this.cleanListeners.push(listener),
                    onDirtyChanged: listener => {
                        this.dirtyListeners.push(() => listener(true))
                        this.cleanListeners.push(() => listener(false))
                    }
                }
                const element = React.createElement(WrappedComponent, {
                    ...this.props, form, inputs
                })
                return (
                    <FormContext.Provider value={form}>
                        {element}
                    </FormContext.Provider>
                )
            }
        }

        Form.displayName = `Form(${getDisplayName(WrappedComponent)})`
        return compose(
            Form,
            connect(mapStateToProps ? mapStateToProps : null)
        )
    }

const getDisplayName = Component =>
    Component.displayName || Component.name || 'Component'

class FormProperty {
    static _EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/ // eslint-disable-line no-useless-escape

    _predicates = []
    _skip = []

    skip(when) {
        this._skip.push(when)
        return this
    }

    predicate(constraint, messageId, messageArgs = () => ({})) {
        this._predicates.push([constraint, messageId, messageArgs])
        return this
    }

    match(regex, messageId, messageArgs) {
        return this.predicate(value => regex.test(value), messageId, messageArgs)
    }

    notEmpty(messageId, messageArgs) {
        return this.predicate(value => {
            if (Array.isArray(value))
                return value.length > 0
            else if (value === Object(value))
                return Object.keys(value).length > 0
            else
                return !!value
        },
        messageId,
        messageArgs
        )
    }

    notBlank(messageId, messageArgs) {
        return this.predicate(value => !!value, messageId, messageArgs)
    }

    email(messageId, messageArgs) {
        return this.match(Constraint._EMAIL_REGEX, messageId, messageArgs)
    }

    date(format, messageId, messageArgs) {
        return this.predicate(value => moment(value, format).isValid(), messageId, messageArgs)
    }

    int(messageId, messageArgs) {
        return this.predicate(value => String(value).match(/^\d+$/), messageId, messageArgs)
    }

    min(minValue, messageId, messageArgs) {
        return this.predicate(value => value >= minValue, messageId, messageArgs)
    }

    check(name, values) {
        const skip = this._isSkipped(name, values)
        const failingConstraint = !skip &&
            this._predicates.find(constraint =>
                this._checkPredicate(name, values, constraint[0]) ? null : constraint[1]
            )
        return failingConstraint ? msg(failingConstraint[1], failingConstraint[2](values)) : ''
    }

    _checkPredicate(_name, _values, _predicate) {
        throw Error('Expected to be implemented by subclass')
    }

    _isSkipped(_name, _values) {
        throw Error('Expected to be implemented by subclass')
    }
}

export class Constraint extends FormProperty {
    constructor(fieldNames) {
        super()
        this.fieldNames = fieldNames
        if (!Array.isArray(fieldNames) || fieldNames.length < 2)
            throw Error('Constructor of Constraint requires an array of at least 2 field names')
    }

    _checkPredicate(name, values, predicate) {
        return predicate(values)
    }

    _isSkipped(name, values) {
        return this._skip.find(when => when(values))
    }
}

export class Field extends FormProperty {
    _checkPredicate(name, values, predicate) {
        return predicate(values[name], values)
    }

    _isSkipped(name, values) {
        return this._skip.find(when => when(values[name], values))
    }
}

const FormContext = React.createContext()

export const ErrorMessage = props => {
    return <FormContext.Consumer>
        {form => {
            let sources = props['for'] || []
            if (!Array.isArray(sources))
                sources = [sources]
            const error = sources
                .map(source =>
                    (typeof source) === 'string' ? form.errors[source] : source.error
                )
                .find(error => error)
            return (
                <div className={styles.errorMessageContainer}>
                    <div className={[styles.errorMessage, props.className].join(' ')}>
                        {error}
                    </div>
                </div>
            )
        }}
    </FormContext.Consumer>
}

ErrorMessage.propTypes = {
    'for': PropTypes.any.isRequired,
    className: PropTypes.string
}

export class Form extends React.Component {
    render() {
        const {className, onSubmit, children} = this.props
        return (
            <form
                className={className}
                onSubmit={e => {
                    e.preventDefault()
                    onSubmit && onSubmit(e)
                }}>
                {children}
            </form>
        )
    }
}

Form.propTypes = {
    children: PropTypes.any.isRequired,
    onSubmit: PropTypes.func.isRequired,
    className: PropTypes.string
}

export class Input extends React.Component {
    element = React.createRef()
    state = {
        textareaFocused: false
    }

    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                tabIndex={-1}
            />
        ) : null
    }

    renderInput() {
        const {
            className, input, type = 'text', validate = 'onBlur', tabIndex,
            autoFocus = false, autoComplete = false, autoCorrect = false, autoCapitalize = false, spellCheck = false,
            onChange, onBlur, ...props
        } = this.props
        const extraProps = _.omit(props, ['errorMessage'])
        return (
            <input
                ref={this.element}
                className={[input.validationFailed ? styles.error : null, className].join(' ')}
                type={type}
                name={input.name}
                value={typeof input.value === 'number' || typeof input.value === 'boolean' || input.value ? input.value : ''}
                tabIndex={tabIndex}
                autoFocus={autoFocus && !isMobile()}
                autoComplete={autoComplete ? 'on' : 'off'}
                autoCorrect={autoCorrect ? 'on' : 'off'}
                autoCapitalize={autoCapitalize ? 'on' : 'off'}
                spellCheck={spellCheck ? 'true' : 'false'}
                onChange={e => {
                    input.handleChange(e)
                    if (onChange)
                        onChange(e)
                    if (validate === 'onChange')
                        input.validate()
                }}
                onBlur={e => {
                    if (onBlur)
                        onBlur(e)
                    if (validate === 'onBlur')
                        input.validate()
                }}
                {...extraProps}
            />
        )
    }

    renderTextArea() {
        const {input, minRows, maxRows, validate = 'onBlur', tabIndex, onChange, className, onBlur} = this.props
        const {textareaFocused} = this.state
        return (
            <Keybinding keymap={{Enter: null}} disabled={!textareaFocused} priority>
                <Textarea
                    ref={this.element}
                    name={input.name}
                    value={input.value || ''}
                    tabIndex={tabIndex}
                    minRows={minRows}
                    maxRows={maxRows}
                    onChange={e => {
                        input.handleChange(e)
                        if (onChange)
                            onChange(e)
                        if (validate === 'onChange')
                            input.validate()
                    }}
                    onFocus={() => this.setState({textareaFocused: true})}
                    onBlur={e => {
                        this.setState({textareaFocused: false})
                        if (onBlur)
                            onBlur(e)
                        if (validate === 'onBlur')
                            input.validate()
                    }}
                    className={[input.validationFailed ? styles.error : null, className].join(' ')}
                />
            </Keybinding>
        )
    }

    renderErrorMessage() {
        const {errorMessage, input} = this.props
        return errorMessage ? (
            <ErrorMessage for={errorMessage === true ? input.name : errorMessage} tabIndex={-1}/>
        ) : null
    }

    render() {
        const {textArea} = this.props
        return (
            <div>
                {this.renderLabel()}
                {textArea ? this.renderTextArea() : this.renderInput()}
                {this.renderErrorMessage()}
            </div>
        )
    }

    focus() {
        this.element.current.focus()
    }
}

Input.propTypes = {
    input: PropTypes.object.isRequired,
    autoCapitalize: PropTypes.any,
    autoComplete: PropTypes.any,
    autoCorrect: PropTypes.any,
    autoFocus: PropTypes.any,
    className: PropTypes.string,
    label: PropTypes.string,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    placeholder: PropTypes.string,
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

export class InputGroup extends React.Component {
    renderLabel() {
        const {label, tooltip, tooltipPlacement = 'top'} = this.props
        return label ? (
            <Label
                msg={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
            />
        ) : null
    }

    renderErrorMessage() {
        const {errorMessage, input} = this.props
        return errorMessage ? (
            <ErrorMessage for={errorMessage === true ? input.name : errorMessage}/>
        ) : null
    }

    render() {
        const {children} = this.props
        return (
            <React.Fragment>
                {this.renderLabel()}
                <fieldset>
                    {children}
                </fieldset>
                {this.renderErrorMessage()}
            </React.Fragment>
        )
    }
}

InputGroup.propTypes = {
    children: PropTypes.oneOfType([PropTypes.array, PropTypes.object]).isRequired,
    label: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}
