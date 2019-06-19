import {FormComponent} from 'widget/formComponents'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import moment from 'moment'
import withContext from 'context'

const FormContext = React.createContext()

export const withFormContext = withContext(FormContext, 'form')

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

export const getErrorMessage = (form, input) =>
    _.chain([input])
        .flatten()
        .compact()
        .map(source =>
            _.isString(source)
                ? form.errors[source]
                : source.error
        )
        .find(error => error)
        .value() || ''

export const ErrorMessage = props => {
    return (
        <FormContext.Consumer>
            {form => getErrorMessage(form, props['for'])}
        </FormContext.Consumer>
    )
}

ErrorMessage.propTypes = {
    'for': PropTypes.any.isRequired,
    className: PropTypes.string
}

class _FieldSet extends React.Component {
    render() {
        const {form, className, layout, spacing, disabled, label,
            tooltip, tooltipPlacement, errorMessage, children} = this.props
        return (
            <FormComponent
                className={className}
                layout={layout}
                spacing={spacing}
                disabled={disabled}
                label={label}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                errorMessage={errorMessage && getErrorMessage(form, errorMessage)}
            >
                {children}
            </FormComponent>
        )
    }
}

export const FieldSet = compose(
    _FieldSet,
    withFormContext()
)

FieldSet.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.oneOfType([PropTypes.string, PropTypes.array]),
    input: PropTypes.object,
    label: PropTypes.string,
    layout: PropTypes.oneOf(['vertical', 'horizontal']),
    spacing: PropTypes.oneOf(['normal', 'compact', 'none']),
    tooltip: PropTypes.string,
    tooltipPlacement: PropTypes.string
}

FieldSet.defaultProps = {
    spacing: 'normal',
    layout: 'vertical'
}
