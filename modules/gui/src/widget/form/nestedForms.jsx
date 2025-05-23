import _ from 'lodash'
import React from 'react'

import {compose} from '~/compose'
import {withForm} from '~/widget/form/form'

const Context = React.createContext()

export class NestedForms extends React.Component {
    state = {
        invalidEntities: []
    }

    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
    }

    onChange(entity, error) {
        const {arrayInput, idPropName, onChange} = this.props
        const updatedArray = arrayInput.value.map(prevEntity =>
            prevEntity[idPropName] === entity[idPropName]
                ? entity
                : prevEntity
        )
        arrayInput.set(updatedArray)
        this.setState(
            ({invalidEntities}) => {
                const filteredInvalidEntities = _.pick(
                    invalidEntities,
                    updatedArray.map(entity => entity[idPropName])
                )
                return error
                    ? {invalidEntities: {...filteredInvalidEntities, ...{[entity[idPropName]]: error}}}
                    : {invalidEntities: _.omit(filteredInvalidEntities, [entity[idPropName]])}
            },
            () => {
                const anyInvalid = this.hasInvalidEntity()
                arrayInput.setInvalid(anyInvalid
                    ? Object.values(this.state.invalidEntities)[0]
                    : ''
                )
                onChange && onChange(entity, anyInvalid)
            }
        )
    }

    render() {
        const {arrayInput, children} = this.props
        return (
            <Context.Provider value={{arrayInput, onChange: this.onChange}}>
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
                    setImmediate(() => {
                        const errorMessages = Object.values(this.props.form.errors).filter(error => error)
                        const error = errorMessages.length ? errorMessages[0] : ''
                        const {onChange} = this.context
                        onChange(updatedEntity, error)
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
    
