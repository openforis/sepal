import React from 'react'
import {connect} from 'store'
import styles from './form.module.css'
import PropTypes from 'prop-types'
import {msg} from 'translate'

export function form(
    {
        inputs,
        props,
        actions: {onSubmit, ...otherActions},
        componentWillMount,
        componentWillUnmount
    }
) {
    return (WrappedComponent) => {
        class Form extends React.Component {
            constructor(props) {
                super(props)
                const state = {
                    values: props.values || {},
                    errors: props.errors || {}
                }

                Object.keys(inputs).forEach(name => {
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
                if ('values' in nextProps)
                    this.setState((prevState) =>
                        ({...prevState, values: {...prevState.values, ...nextProps.values}})
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
                this.setState((prevState) => {
                    const state = Object.assign({}, prevState)
                    state.values[name] = value
                    state.errors[name] = ''
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
                        submit: () => onSubmit.bind(this)(this.state.values)
                    },
                    inputs: formInputs
                })
            }
        }

        Form = connect({props, actions: {onSubmit, ...otherActions}, componentWillMount, componentWillUnmount})(Form)
        Form.displayName = `${getDisplayName(WrappedComponent)}`
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
