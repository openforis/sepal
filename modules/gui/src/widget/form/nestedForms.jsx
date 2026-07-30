import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {withForm} from '~/widget/form/form'

const Context = React.createContext()

export class NestedForms extends React.Component {
    state = {
        invalidEntities: {}
    }

    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onErrorChange = this.onErrorChange.bind(this)
    }

    onChange(entity) {
        const {arrayInput, idPropName} = this.props

        const updatedArray = arrayInput.value.map(prevEntity =>
            prevEntity[idPropName] === entity[idPropName]
                ? entity
                : prevEntity
        )
        arrayInput.set(updatedArray)
    }

    onErrorChange(entity, error) {
        const {arrayInput, idPropName} = this.props
        const prevError = arrayInput.error
        this.setState(({invalidEntities}) => {
            const updatedInvalidEntries = error
                ? {...invalidEntities, ...{[entity[idPropName]]: error}}
                : _.omit(invalidEntities, [entity[idPropName]])
            return _.isEqual(invalidEntities, updatedInvalidEntries)
                ? null
                : {invalidEntities: updatedInvalidEntries}
        }, () => {
            if (prevError !== error) {
                arrayInput.setInvalid(error)
            }
        })
    }

    render() {
        const {arrayInput, children} = this.props
        return (
            <Context.Provider value={{arrayInput, onChange: this.onChange, onErrorChange: this.onErrorChange}}>
                {children}
            </Context.Provider>
        )

    }

    hasInvalidEntity() {
        const {invalidEntities} = this.state
        return !!Object.keys(invalidEntities).length
    }
    
}

export const withNestedForm = ({fields, constraints, entityPropName, arrayFieldName}) =>
    WrappedComponent => {
        class WithSomethingHOC extends React.Component {
            static contextType = Context

            render() {
                return (
                    <WrappedComponent {...this.props}/>
                )
            }

            componentDidMount() {
                if (arrayFieldName) {
                    const {inputs} = this.props
                    const {arrayInput} = this.context
                    inputs[arrayFieldName].set(arrayInput.value)
                    arrayInput.onChange(array => inputs[arrayFieldName].set(array))
                }
                this.updateInputs()
                
            }

            componentDidUpdate(prevProps) {
                const {inputs} = this.props
                const entity = this.props[entityPropName]
                const prevEntity = prevProps[entityPropName]
                const array = arrayFieldName && inputs[arrayFieldName].value
                const prevArray = arrayFieldName && prevProps.inputs[arrayFieldName].value
                const {onChange, onErrorChange} = this.context
                
                if (!_.isEqual(prevEntity, entity)) {
                    this.updateInputs()
                }

                const inputEntity = this.inputsToEntity(this.props)
                if (!_.isEqual(this.inputsToEntity(prevProps), inputEntity)
                    || !_.isEqual(prevArray, array)) {
                    const updatedEntity = {
                        ...entity,
                        ...inputEntity
                    }
                    onChange(updatedEntity)

                    setImmediate(() => {
                        const errors = Object.values(this.props.form.errors).filter(error => error)
                        const hasError = !!errors.length
                        onErrorChange(entity, hasError ? errors[0] : '')
                    })
                }
            }

            updateInputs() {
                const {inputs} = this.props
                const entity = this.props[entityPropName]
                Object.keys(inputs)
                    .filter(fieldName => Object.keys(entity).includes(fieldName))
                    .map(fieldName => inputs[fieldName].set(entity[fieldName]))

            }

            inputsToEntity(props) {
                const entity = props[entityPropName]
                const fieldNames = Object.keys(this.props.inputs)
                    .filter(fieldName => Object.keys(entity).includes(fieldName))
                const values = fieldNames
                    .map(fieldName => props.inputs[fieldName].value)
                return _.zipObject(fieldNames, values)
            }
        }
        return compose(
            WithSomethingHOC,
            withForm({fields, constraints})
        )
    }
