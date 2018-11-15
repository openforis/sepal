import {connect} from 'store'
import {msg} from 'translate'
import Icon from './icon'
import PropTypes from 'prop-types'
import React from 'react'
import Textarea from 'react-textarea-autosize'
import Tooltip from './tooltip'
import _ from 'lodash'
import moment from 'moment'
import styles from './form.module.css'

export function form({fields = {}, constraints = {}, mapStateToProps}) {
    return WrappedComponent => {
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
                    dirty: false
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

            subscribe(description, stream$, observer) {
                this.props.subscribe(description, stream$, observer)
            }

            UNSAFE_componentWillReceiveProps(nextProps) {
                if ('errors' in nextProps)
                    this.setState(prevState =>
                        ({...prevState, errors: nextProps.errors})
                    )
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
                        const state = Object.assign({}, prevState)
                        state.values[name] = value
                        this.clearErrorsForField(name, state.errors)
                        state.invalidValue[name] = ''
                        state.dirty = !!Object.keys(state.initialValues).find(name =>
                            state.initialValues[name] !== state.values[name]
                        )
                        state.gotDirty = state.dirty && !prevState.dirty
                        state.gotClean = !state.dirty && prevState.dirty
                        return state
                    }, () => {
                        return this.notifyOnChange(name, value)
                    })
                return this
            }

            notifyOnChange(name, value) {
                const listeners = this.changeListenersByInputName[name] || []
                listeners.forEach(listener => listener(value))
                if (this.state.gotDirty)
                    this.onDirty()
                else if (this.state.gotClean)
                    this.onClean()
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

            reset() {
                this.setState(prevState => {
                    const state = {...prevState, values: {...prevState.initialValues}, dirty: false}
                    Object.keys(fields).forEach(name => {
                        this.clearErrorsForField(name, state.errors)
                    })
                    state.gotDirty = false
                    state.gotClean = prevState.dirty
                    return state
                }, () => this.notifyOnChange())
            }

            isValueDirty(name) {
                const state = this.state
                return state.values[name] !== state.initialValues[name]
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
                    reset: () => this.reset(),
                    values: () => this.state.values,
                    onDirty: listener => this.dirtyListeners.push(listener),
                    onClean: listener => this.cleanListeners.push(listener)
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
        return connect(mapStateToProps ? mapStateToProps : null)(Form)
    }
}

function getDisplayName(Component) {
    return Component.displayName || Component.name || 'Component'
}

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
        throw new Error('Expected to be implemented by subclass')
    }

    _isSkipped(_name, _values) {
        throw new Error('Expected to be implemented by subclass')
    }
}

export class Constraint extends FormProperty {
    constructor(fieldNames) {
        super()
        this.fieldNames = fieldNames
        if (!Array.isArray(fieldNames) || fieldNames.length < 2)
            throw new Error('Constructor of Constraint requires an array of at least 2 field names')
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
                <div className={[styles.errorMessage, props.className].join(' ')}>
                    {error}
                </div>
            )
        }}
    </FormContext.Consumer>
}

ErrorMessage.propTypes = {
    'for': PropTypes.any.isRequired,
    className: PropTypes.string
}

export class Input extends React.Component {
    element = React.createRef()

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

    renderInput() {
        const {input, validate = 'onBlur', tabIndex, onChange, className, onBlur, ...props} = this.props
        const extraProps = _.omit(props, ['errorMessage'])
        return (
            <input
                {...extraProps}
                ref={this.element}
                name={input.name}
                value={typeof input.value === 'number' || typeof input.value === 'boolean' || input.value ? input.value : ''}
                tabIndex={tabIndex}
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
                className={[input.validationFailed ? styles.error : null, className].join(' ')}
            />
        )
    }

    renderTextArea() {
        const {input, minRows, maxRows, validate = 'onBlur', tabIndex, onChange, className, onBlur, ...props} = this.props
        return (
            <Textarea
                {...props}
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
                onBlur={e => {
                    if (onBlur)
                        onBlur(e)
                    if (validate === 'onBlur')
                        input.validate()
                }}
                className={[input.validationFailed ? styles.error : null, className].join(' ')}
            />
        )
    }

    renderErrorMessage() {
        const {errorMessage, input} = this.props
        return errorMessage ? (
            <ErrorMessage for={errorMessage === true ? input.name : errorMessage}/>
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
    autoComplete: PropTypes.string,
    className: PropTypes.string,
    label: PropTypes.string,
    maxRows: PropTypes.number,
    minRows: PropTypes.number,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    textArea: PropTypes.any,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string,
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

export class Label extends React.Component {
    renderContents() {
        const {msg, children} = this.props
        return children ? children : msg
    }

    renderLabel(contents) {
        return (
            <label className={styles.label}>
                {contents}
            </label>
        )
    }

    renderLabelWithTooltip(contents) {
        const {tooltip, tooltipPlacement} = this.props
        return (
            <label className={styles.label}>
                {contents}
                <Tooltip msg={tooltip} placement={tooltipPlacement}>
                    <Icon className={styles.info} name='question-circle'/>
                </Tooltip>
            </label>
        )
    }

    render() {
        const {tooltip} = this.props
        return tooltip
            ? this.renderLabelWithTooltip(this.renderContents())
            : this.renderLabel(this.renderContents())
    }
}

Label.propTypes = {
    children: PropTypes.oneOfType([PropTypes.object, PropTypes.array]),
    msg: PropTypes.string,
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}
