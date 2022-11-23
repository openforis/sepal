import {FormButtons} from 'widget/form/buttons'
import {FormCheckbox} from 'widget/form/checkbox'
import {FormCombo} from 'widget/form/combo'
import {FormConstraint, FormField} from 'widget/form/property'
import {FormContext} from 'widget/form/context'
import {FormDatePicker} from 'widget/form/datePicker'
import {FormError} from 'widget/form/error'
import {FormFieldSet} from 'widget/form/fieldset'
import {FormInput} from 'widget/form/input'
import {FormPanel} from 'widget/form/panel'
import {FormPanelButtons} from 'widget/form/panelButtons'
import {FormSlider} from 'widget/form/slider'
import {FormYearPicker} from 'widget/form/yearPicker'
import {compose} from 'compose'
import {connect} from 'store'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

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
                    invalid: {},
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
                if (value !== prevValue && !_.isEqual(value, prevValue)) {
                    this.setState(prevState => {
                        const state = _.cloneDeep(prevState)
                        state.values[name] = value
                        this.clearErrorsForField(name, state.errors)
                        state.invalid[name] = false
                        state.dirty = !!Object.keys(state.initialValues)
                            .find(name =>
                                !_.isEqual(state.initialValues[name], state.values[name])
                            )
                        state.gotDirty[name] = state.gotDirty[name] || (state.dirty && !prevState.dirty)
                        state.gotClean[name] = state.gotClean[name] || (!state.dirty && prevState.dirty)
                        return state
                    }, () => {
                        this.validateField(name)
                        this.notifyOnChange(name, value)
                    })
                }
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
                const field = fields[name]
                return field ? field.check(name, this.state.values) : ''
            }

            checkConstraintError(name) {
                const constraint = constraints[name]
                return constraint ? constraint.check(name, this.state.values) : ''
            }

            validateField(name) {
                this.setState(prevState => {
                    const state = Object.assign({}, prevState)
                    if (!state.invalid[name]) {
                        state.errors[name] = this.checkFieldError(name)
                    }
                    const constraintNames = this.constraintNamesByFieldName[name]
                    constraintNames && constraintNames.forEach(constraintName =>
                        state.errors[constraintName] = this.checkConstraintError(constraintName)
                    )
                    return state
                })
                return this
            }

            isInvalid() {
                const hasExternallyInvalidatedField = !_.isEmpty(
                    _.pickBy(
                        this.state.invalid,
                        (error, name) => error && !this.isSkipped(name)
                    )
                )
                const hasInvalidField = !!Object.keys(this.state.values).find(name => this.checkFieldError(name))
                const hasInvalidConstraint = !!Object.keys(constraints).find(name => this.checkConstraintError(name))
                return hasInvalidField || hasInvalidConstraint || hasExternallyInvalidatedField
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

            resetValue(name) {
                const state = this.state
                this.set(name, state.initialValues[name])
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

            getFieldError(name) {
                return this.isSkipped(name)
                    ? ''
                    : this.state.errors[name]
            }

            isSkipped(name) {
                const field = fields[name]
                return !!(field && field.isSkipped(name, this.state.values))
            }

            filterErrors(errors) {
                return _.mapValues(errors, (_error, name) => this.getFieldError(name))
            }

            reset() {
                Object.keys(fields).forEach(name => this.setInitialValue(name))
            }

            render() {
                const inputs = {}
                Object.keys(fields).forEach(name => {
                    inputs[name] = {
                        name,
                        value: this.state.values[name],
                        error: this.getFieldError(name),
                        validationFailed: !!this.getFieldError(name) || !!this.getConstraintErrorsForField(name),
                        isInvalid: () => this.checkFieldError(name),
                        setInvalid: msg => this.setState(prevState => ({
                            ...prevState,
                            errors: {...this.filterErrors(prevState.errors), [name]: msg},
                            invalid: {...prevState.invalid, [name]: !!msg}
                        })),
                        validate: () => this.validateField(name),
                        isDirty: () => this.isValueDirty(name),
                        set: value => this.set(name, value),
                        setInitialValue: value => this.setInitialValue(name, value),
                        resetValue: () => this.resetValue(name),
                        handleChange: e => this.handleChange(e),
                        onChange: listener => {
                            const listeners = this.changeListenersByInputName[name] || []
                            this.changeListenersByInputName[name] = listeners
                            listeners.push(listener)
                        }
                    }
                })
                const form = {
                    errors: this.filterErrors(this.state.errors),
                    isInvalid: this.isInvalid,
                    isDirty: () => this.isDirty(),
                    setInitialValues: values => this.setInitialValues(values),
                    values: () => this.state.values,

                    onDirty: listener => listener && this.dirtyListeners.push(listener),
                    onClean: listener => listener && this.cleanListeners.push(listener),
                    onDirtyChanged: listener => {
                        this.dirtyListeners.push(() => listener(true))
                        this.cleanListeners.push(() => listener(false))
                    },
                    reset: () => this.reset()
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

export class Form extends React.Component {
    constructor() {
        super()
        this.onSubmit = this.onSubmit.bind(this)
    }

    render() {
        const {className, children} = this.props
        return (
            <form
                className={className}
                onSubmit={this.onSubmit}>
                {children}
            </form>
        )
    }

    onSubmit(e) {
        const {onSubmit} = this.props
        e.preventDefault()
        onSubmit && onSubmit(e)
    }
}

Form.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    onSubmit: PropTypes.func
}

Form.Buttons = FormButtons
Form.Checkbox = FormCheckbox
Form.Combo = FormCombo
Form.Constraint = FormConstraint
Form.DatePicker = FormDatePicker
Form.Error = FormError
Form.Field = FormField
Form.FieldSet = FormFieldSet
Form.Input = FormInput
Form.Panel = FormPanel
Form.PanelButtons = FormPanelButtons
Form.Slider = FormSlider
Form.YearPicker = FormYearPicker
