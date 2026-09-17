import PropTypes from 'prop-types'
import React from 'react'

import {actionBuilder} from '~/action-builder'
import {initValues} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {withPanelWizard} from '~/widget/panelWizard'

const Context = React.createContext()

const defaultPolicy = ({values, panelWizard: {wizard}}) =>
    wizard || selectFrom(values, 'dirty')
        ? {_: 'disallow'}
        : {_: 'allow-then-deactivate'}

export const recipeFormPanel = (
    {
        id,
        fields,
        constraints,
        path,
        mapRecipeToProps = () => ({}),
        modelToValues = model => ({...model}),
        valuesToModel = values => ({...values}),
        policy = defaultPolicy,
        additionalPolicy = () => ({})
    }) => {
    path = path || (() => id)
    const createMapRecipeToProps = mapRecipeToProps => {
        return (recipe, props) => {
            const evaluatedPath = path(props)
            if (!evaluatedPath) {
                return null
            }
            const additionalProps = mapRecipeToProps(recipe)
            const model = selectFrom(recipe, ['model', evaluatedPath])
            const values = selectFrom(recipe, ['ui', evaluatedPath])
            return {recipeId: recipe.id, model, values, ...additionalProps}
        }
    }

    const valuesSpec = {
        getModel: props => props.model,
        getValues: props => props.values,
        modelToValues,
        onInitialized: ({values, props}) => {
            const {recipeStatePath: statePath} = props
            const evaluatedPath = path(props)
            setValues({evaluatedPath, statePath, values})
        }
    }

    return WrappedComponent => {
        const policyToApply = props => ({...policy(props), ...additionalPolicy(props)})
        // [HACK] Using withRecipe() twice.
        // withActivatable() is dependent on recipe for its policy -> withRecipe() before withActivatable()
        // withRecipe() is dependent on activatable props -> withActivatable() before withRecipe()
        return compose(
            class RecipeFormPanelHOC extends React.Component {
                constructor(props) {
                    super(props)
                    const {values, recipeStatePath: statePath, form} = props
                    this.prevValues = values
    
                    form.onDirtyChanged(dirty => setDirty({evaluatedPath: path(props), statePath, dirty}))
                }
    
                render() {
                    const {form, recipeStatePath: statePath, activatable: {deactivate}} = this.props
                    return (
                        <Context.Provider value={{
                            id,
                            evaluatedPath: path(this.props),
                            form,
                            statePath,
                            valuesToModel,
                            deactivate,
                            prevValues: this.prevValues
                        }}>
                            {React.createElement(WrappedComponent, {...this.props, form})}
                        </Context.Provider>
                    )
                }
            },
            withForm({fields, constraints}),
            initValues(valuesSpec),
            withRecipe(createMapRecipeToProps(mapRecipeToProps)),
            withActivatable({id, policy: policyToApply}),
            withRecipe(createMapRecipeToProps(mapRecipeToProps)),
            withPanelWizard()
        )
    }
}

export const RecipeFormPanel = ({className, placement, isActionForm, additionalUpdates, onApply, onCancel, onClose, children}) =>
    <Context.Consumer>
        {({id, evaluatedPath, form, statePath, valuesToModel, deactivate, prevValues}) => {
            const wrappedOnApply = values => {
                if (isActionForm) {
                    setValues({evaluatedPath, statePath, values})
                    onApply && onApply(values)
                } else if (valuesToModel) {
                    const model = valuesToModel(values)
                    setModelAndValues({
                        evaluatedPath, statePath, model, values,
                        updates: additionalUpdates ? additionalUpdates(values) : []
                    })
                    onApply && onApply(values, model, prevValues)
                }
            }
            return (
                <Form.Panel
                    id={id}
                    className={className}
                    placement={placement}
                    form={form}
                    isActionForm={isActionForm}
                    onApply={values => {
                        wrappedOnApply(values)
                    }}
                    onCancel={() => {
                        onCancel && onCancel()
                    }}
                    onClose={() => {
                        deactivate()
                        onClose && onClose()
                    }}
                >
                    {children}
                </Form.Panel>
            )
        }}
    </Context.Consumer>

RecipeFormPanel.propTypes = {
    children: PropTypes.any.isRequired,
    // The rest of the recipe this panel's values imply, as [{path, value, merge}] over recipe-relative
    // paths, published in the same action as the panel's own model.
    additionalUpdates: PropTypes.func,
    className: PropTypes.string,
    isActionForm: PropTypes.any,
    placement: PropTypes.any,
    onApply: PropTypes.func,
    onCancel: PropTypes.func,
    onClose: PropTypes.func
}

// One action, so no subscriber observes this panel's new model beside settings it was applied to replace.
const setModelAndValues = ({evaluatedPath, statePath, model, values, updates = []}) => {
    if (!evaluatedPath)
        return
    return updates
        .reduce(
            (builder, {path, value, merge}) => merge
                ? builder.assign([statePath, path], value)
                : builder.set([statePath, path], value),
            actionBuilder('SET_MODEL_AND_VALUES', {evaluatedPath, model, values})
                .setIfChanged([statePath, 'ui', evaluatedPath], values)
                .setIfChanged([statePath, 'model', evaluatedPath], model)
        )
        .dispatch()
}

const setValues = ({evaluatedPath, statePath, values}) => {
    if (!evaluatedPath)
        return
    actionBuilder('SET_VALUES', {evaluatedPath, values})
        .setIfChanged([statePath, 'ui', evaluatedPath], values)
        .dispatch()
}

const setDirty = ({evaluatedPath, statePath, dirty}) => {
    if (!evaluatedPath)
        return
    actionBuilder('SET_DIRTY', {evaluatedPath, dirty})
        .setIfChanged([statePath, 'ui', evaluatedPath, 'dirty'], dirty)
        .dispatch()
}
