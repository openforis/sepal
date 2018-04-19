import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {msg} from 'translate'
import styles from './form.module.css'

export function form(inputs, mapStateToProps) {
    return (WrappedComponent) => {
        class Form extends React.Component {
            onDirtyListeners = []
            onCleanListeners = []

            constructor(props) {
                super(props)
                const state = {
                    initialValues: {...props.values} || {},
                    values: {...props.values} || {},
                    errors: {...props.errors} || {},
                    dirty: false
                }
                Object.keys(inputs).forEach(name => {
                    state.initialValues[name] = name in state.initialValues ? state.initialValues[name] : ''
                    state.values[name] = name in state.values ? state.values[name] : ''
                    state.errors[name] = name in state.errors ? state.errors[name] : ''
                })
                this.state = state

                this.handleChange = this.handleChange.bind(this)
                this.value = this.value.bind(this)
                this.validate = this.validate.bind(this)
                this.hasInvalid = this.hasInvalid.bind(this)
            }

            subscribe(description, stream$, observer) {
                this.props.subscribe(description, stream$, observer)
            }

            componentWillReceiveProps(nextProps) {
                if ('errors' in nextProps)
                    this.setState((prevState) =>
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
                if (value != null && value !== this.state.values[name])
                    this.setState((prevState) => {
                        const state = Object.assign({}, prevState)
                        state.values[name] = value
                        state.errors[name] = ''
                        state.dirty = state.initialValues[name] !== value
                        if (state.dirty && !prevState.dirty)
                            this.onDirty()
                        if (!state.dirty && prevState.dirty)
                            this.onClean()
                        return state
                    })
                return this
            }

            value(name) {
                return this.state.values[name]
            }

            error(name) {
                let constraints = inputs[name]
                if (constraints == null)
                    constraints = new Constraints()
                return constraints.check(name, this.state.values)
            }

            validate(name) {
                this.setState((prevState) => {
                    const state = Object.assign({}, prevState)
                    state.errors[name] = this.error(name)
                    return state
                })
                return this
            }

            hasInvalid() {
                return !!Object.keys(this.state.values).find(name => this.error(name))
            }

            setInitialValues(values) {
                if (!values)
                    return
                this.setState((prevState) => {
                    const state = {...prevState, dirty: false}
                    Object.keys(inputs).forEach(name => {
                        state.initialValues[name] = name in values ? values[name] : ''
                        state.values[name] = name in values ? values[name] : ''
                        state.errors[name] = ''
                    })
                    if (prevState.dirty)
                        this.onClean()
                    return state
                })
            }

            reset() {
                this.setState((prevState) => {
                    const dirty = !!Object.keys(inputs).find((name) => {
                            this.state.values[name] !== this.state.initialValues
                        }
                    )
                    const state = {...prevState, values: {...prevState.initialValues}, dirty: dirty}
                    Object.keys(inputs).forEach(name => {
                        state.errors[name] = ''
                    })
                    if (state.dirty && !prevState.dirty)
                        this.onDirty()
                    if (!state.dirty && prevState.dirty)
                        this.onClean()
                    return state
                })
            }

            isValueDirty(name) {
                const state = this.state
                return state.values[name] !== state.initialValues[name]
            }

            isDirty() {
                return !!Object.keys(this.state.initialValues)
                    .find((name) => this.isValueDirty(name))
            }

            onDirty() {
                this.onDirtyListeners.forEach((listener) => listener())
            }

            onClean() {
                this.onCleanListeners.forEach((listener) => listener())
            }

            render() {
                const formInputs = {}
                Object.keys(inputs).forEach(name => {
                    formInputs[name] = {
                        name: name,
                        value: this.state.values[name],
                        error: this.state.errors[name],
                        errorClass: this.state.errors[name] ? styles.error : null,
                        set: (value) => this.set(name, value),
                        handleChange: (e) => this.handleChange(e),
                        isDirty: () => this.isValueDirty(name),
                        validate: () => this.validate(name)
                    }
                })
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    form: {
                        errors: Object.values(this.state.errors)
                            .filter(error => error),
                        errorClass: styles.error,
                        hasInvalid: this.hasInvalid,
                        onDirty: (listener) => this.onDirtyListeners.push(listener),
                        onClean: (listener) => this.onCleanListeners.push(listener),
                        setInitialValues: (values) => this.setInitialValues(values),
                        reset: () => this.reset(),
                        isDirty: () => this.isDirty(),
                        values: () => this.state.values
                    },
                    inputs: formInputs
                })
            }
        }

        Form.displayName = `Form(${getDisplayName(WrappedComponent)})`
        Form = connect(mapStateToProps ? mapStateToProps : null)(Form)
        return Form
    }
}

function getDisplayName(Component) {
    return Component.displayName || Component.name || 'Component'
}

export class Constraints {
    static _EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/ // eslint-disable-line no-useless-escape

    constraints = []

    predicate(constraint, messageId) {
        this.constraints.push([constraint, messageId])
        return this
    }

    match(regex, messageId) {
        return this.predicate(value => regex.test(value), messageId)
    }

    notBlank(messageId) {
        return this.predicate(value => !!value, messageId)
    }

    email(messageId) {
        return this.match(Constraints._EMAIL_REGEX, messageId)
    }

    check(name, values) {
        const failingConstraint = this.constraints.find(constraint => {
            return constraint[0](values[name], values) ? null : constraint[1]
        })
        return failingConstraint ? msg(failingConstraint[1]) : ''
    }
}

export const ErrorMessage = ({input}) =>
    <div className={styles.errorMessage}>
        {input && input.error}
    </div>

export class Input extends React.Component {
    render() {
        const {input, validate = 'onBlur', onChange, onBlur, ...props} = this.props
        return (
            <input
                {...props}
                name={input.name}
                value={input.value}
                onChange={(e) => {
                    input.handleChange(e)
                    if (onChange)
                        onChange(e)
                    if (validate === 'onChange')
                        input.validate()
                }}
                onBlur={(e) => {
                    if (onBlur)
                        onBlur(e)
                    if (validate === 'onBlur')
                        input.validate()
                }}
                className={input.errorClass}
            />
        )
    }
}

Input.propTypes = {
    input: PropTypes.object.isRequired,
    validate: PropTypes.oneOf(['onChange', 'onBlur']),
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    autoComplete: PropTypes.string,
}
