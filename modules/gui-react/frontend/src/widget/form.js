import React from 'react'
import styles from './form.module.css'
import PropTypes from 'prop-types'
import {msg} from 'translate'
import {connect} from 'react-redux'

export function form(
    {
        inputs,
        selectors,
        componentWillMount,
        onSubmit,
        View
    }) {
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

            this.componentWillMountCallback = componentWillMount

            this.handleChange = this.handleChange.bind(this)
            this.value = this.value.bind(this)
            this.validate = this.validate.bind(this)
            this.hasInvalid = this.hasInvalid.bind(this)
            this.submit = this.submit.bind(this)
        }

        componentWillMount() {
            if (this.componentWillMountCallback)
                this.componentWillMountCallback(this.props)
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
            let constraints = inputs[name]
            if (constraints == null)
                constraints = new Constraints()
            return constraints.check(name, this.state.values)
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
            (onSubmit || this.props.onSubmit)(this.state.values)
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
            return React.createElement(View, {
                ...this.props,
                form: {
                    errors: Object.values(this.state.errors)
                        .filter(error => error),
                    errorClass: styles.error,
                    hasInvalid: this.hasInvalid,
                    submit: this.submit
                },
                inputs: formInputs
            })
        }
    }

    if (selectors)
        return connect(selectors)(Form)
    else
        return Form
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
