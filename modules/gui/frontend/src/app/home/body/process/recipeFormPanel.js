import {activatable} from 'widget/activation/activatable'
import {form} from 'widget/form'
import {initValues} from 'app/home/body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withPanelWizardContext} from 'widget/panelWizard'
import {withRecipe} from 'app/home/body/process/recipeContext'
import FormPanel from 'widget/formPanel'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'

const Context = React.createContext()

const defaultPolicy = ({values, wizardContext: {wizard}}) =>
    wizard || selectFrom(values, 'dirty')
        ? {_: 'disallow'}
        : {_: 'allow-then-deactivate'}

export const recipeFormPanel = ({
    id,
    fields,
    constraints,
    mapRecipeToProps = () => ({}),
    modelToValues = model => ({...model}),
    valuesToModel = values => ({...values}),
    policy = defaultPolicy,
    modelSubscriptions = {}
}) => {
    addSubscriptions(id, modelSubscriptions)

    const createMapRecipeToProps = mapRecipeToProps =>
        recipe => {
            const additionalProps = mapRecipeToProps(recipe)
            return ({
                recipeId: recipe.id,
                model: selectFrom(recipe, ['model', id]),
                values: selectFrom(recipe, ['ui', id]),
                ...additionalProps
            })
        }

    const valuesSpec = {
        getModel: props => props.model,
        getValues: props => props.values,
        modelToValues,
        onInitialized: ({model, values, props}) => {
            const {recipeContext: {statePath}} = props
            setModelAndValues({id, statePath, model, values})
        }
    }

    return WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            constructor(props) {
                super(props)
                const {values, recipeContext: {statePath}, form} = props
                this.prevValues = values
                form.onDirtyChanged(dirty => setDirty({id, statePath, dirty}))
            }

            render() {
                const {form, recipeContext: {statePath}, activatable: {deactivate}} = this.props
                return (
                    <Context.Provider value={{id, form, statePath, valuesToModel, deactivate, prevValues: this.prevValues}}>
                        {React.createElement(WrappedComponent, this.props)}
                    </Context.Provider>
                )
            }
        }

        return (
            withRecipe(createMapRecipeToProps(mapRecipeToProps))(
                withPanelWizardContext()(
                    activatable({id, policy})(
                        initValues(valuesSpec)(
                            form({fields, constraints})(
                                HigherOrderComponent
                            )
                        )
                    )
                )
            )
        )
    }
}

export class RecipeFormPanel extends React.Component {
    render() {
        const {className, placement, isActionForm, onCancel, onClose, children} = this.props
        return (
            <Context.Consumer>
                {({id, form, statePath, valuesToModel, deactivate, prevValues}) =>
                    <FormPanel
                        id={id}
                        className={className}
                        form={form}
                        close={deactivate}
                        isActionForm={isActionForm}
                        placement={placement}
                        onApply={values => this.onApply({id, statePath, values, valuesToModel, prevValues})}
                        onCancel={onCancel}
                        onClose={onClose}>
                        {children}
                    </FormPanel>
                }
            </Context.Consumer>
        )
    }

    onApply({id, statePath, values, valuesToModel, prevValues}) {
        const {onApply, isActionForm} = this.props
        if (isActionForm) {
            setValues({id, statePath, values})
            onApply && onApply(values)
        } else {
            const model = valuesToModel(values)
            setModelAndValues({id, statePath, model, values})
            onApply && onApply(values, model, prevValues)
        }
    }
}

RecipeFormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    className: PropTypes.string,
    isActionForm: PropTypes.any,
    placement: PropTypes.oneOf(['modal', 'top', 'top-right', 'right', 'bottom-right', 'bottom', 'center', 'inline']),
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onClose: PropTypes.func
}

const setModelAndValues = ({id, statePath, model, values}) => {
    const subscriptions = (modelChangeSubscribers[id] || {})
    const bar = Object.keys(subscriptions).map(id => {
        return {id, values: subscriptions[id](model)}
    })
    console.log({subscriptions, bar})
    return actionBuilder('SET_MODEL_AND_VALUES', {id, model, values})
        .set([statePath, 'ui', id], values)
        .set([statePath, 'model', id], model)
        .dispatch()
}

const setValues = ({id, statePath, values}) =>
    actionBuilder('SET_VALUES', {id, values})
        .set([statePath, 'ui', id], values)
        .dispatch()

const setDirty = ({id, statePath, dirty}) =>
    actionBuilder('SET_DIRTY', {id, dirty})
        .set([statePath, 'ui', id, 'dirty'], dirty)
        .dispatch()

const addSubscriptions = (id, subscriptions) => {
    console.log({addSubscriptions})
    Object.keys(subscriptions).forEach(modelId => {
        modelChangeSubscribers = {
            ...modelChangeSubscribers,
            [modelId]: {
                ...(modelChangeSubscribers[modelId] || {}),
                [id]: subscriptions[modelId]
            }
        }
    })
}

let modelChangeSubscribers = {}
