import React from 'react'
import styles from './form.module.css'
import PropTypes from 'prop-types'
import {msg} from 'translate'

export function managedForm(inputs, Component) {
    return class Form extends React.Component {
        constructor(props) {
            super(props)
            const state = {
                values: props.initialState || {},
                errors: props.errors
            }
            Object.keys(inputs).forEach(name => {
                const input = inputs[name]
                input.defaultValue = input.defaultValue == null ? '' : input.defaultValue
                state.values[name] = state.values[name] == null ? input.defaultValue : state.values[name]
                state.errors[name] = state.errors[name] == null ? '' : state.errors[name]
            })
            this.state = state
            this.handleChange = this.handleChange.bind(this)
            this.value = this.value.bind(this)
            this.validate = this.validate.bind(this)
            this.hasInvalid = this.hasInvalid.bind(this)
            this.submit = this.submit.bind(this)
        }

        componentWillReceiveProps(nextProps) {
            this.setState((state) =>
                Object.assign({}, state, {errors: nextProps.errors})
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
            this.setState(state => {
                state = Object.assign({}, state)
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
            let constraints = inputs[name].constraints
            if (constraints == null)
                constraints = new Constraints()
            return constraints.check(this.state.values[name])
        }

        validate(name) {
            this.setState(state => {
                const error = this.error(name)
                state = Object.assign({}, state)
                state.errors[name] = error
                return state
            })
            return this
        }

        hasInvalid() {
            return !!Object.keys(this.state.values).find(name => this.error(name))
        }

        submit() {
            this.props.onSubmit(this.state.values)
        }

        render() {
            const inputs = {}
            Object.keys(this.state.values).forEach(name => {
                inputs[name] = {
                    name: name,
                    value: this.state.values[name],
                    error: this.state.errors[name],
                    errorClass: this.state.errors[name] ? styles.error : null,
                    set: (value) => this.set(name, value),
                    handleChange: (e) => this.handleChange(e),
                    validate: () => this.validate(name)
                }
            })
            return React.createElement(Component, {
                ...this.props,
                form: {
                    errors: Object.values(this.state.errors)
                        .filter(error => error),
                    errorClass: styles.error,
                    hasInvalid: this.hasInvalid,
                    submit: this.submit
                },
                inputs: inputs
            })
        }
    }
}

export class Constraints {
    constraints = []

    function (constraint, messageId) {
        this.constraints.push([constraint, messageId])
        return this
    }

    match(regex, messageId) {
        return this.function(value => regex.test(value), messageId)
    }

    notBlank(messageId) {
        return this.function(value => !!value, messageId)
    }

    email(messageId) {
        return this.match(/^\S+@\S+$/, messageId)
    }

    check(value) {
        const failingConstraint = this.constraints.find(constraint => {
            return constraint[0](value) ? null : constraint[1]
        })
        return failingConstraint ? msg(failingConstraint[1]) : ''
    }
}

export const Input = ({input, validate, onChange, onBlur, ...props}) => (
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
Input.propTypes = {
    input: PropTypes.object.isRequired,
    validate: PropTypes.oneOf(['onChange', 'onBlur']),
    onChange: PropTypes.func,
    onBlur: PropTypes.func,
    placeholder: PropTypes.string,
    tabIndex: PropTypes.number,
    autoFocus: PropTypes.string,
    autoComplete: PropTypes.string,
}
