import actionBuilder from 'action-builder'
import {initValues} from 'app/home/body/process/recipe'
import {withRecipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'collections'
import React from 'react'
import {activatable} from 'widget/activation/activatable'
import {form} from 'widget/form'
import FormPanel from 'widget/formPanel'


const Context = React.createContext()

const policy = ({values}) => {
    return selectFrom(values, 'dirty')
        ? {compatibleWith: {include: []}}
        : {deactivateWhen: {exclude: []}}
}

export const recipeActionPanel =
    ({
         id,
         fields,
         mapRecipeToProps = () => ({})
     }) => {

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
                render() {
                    const {form, recipeContext: {statePath}, deactivate} = this.props
                    return (
                        <Context.Provider value={{id, form, statePath, valuesToModel, deactivate}}>
                            {React.createElement(WrappedComponent, this.props)}
                        </Context.Provider>
                    )
                }

                componentDidMount() {
                    const {id, recipeContext: {statePath}, form} = this.props
                    form.onDirtyChanged(dirty => setDirty({id, statePath, dirty}))
                }
            }

            return (
                withRecipe(createMapRecipeToProps(mapRecipeToProps))(
                    activatable(id, policy)(
                        initValues(valuesSpec)(
                            form({fields})(
                                HigherOrderComponent
                            )
                        )
                    )
                )
            )
        }
    }

export class RecipeFormPanel extends React.Component {
    render() {
        const {className, placement, children} = this.props
        return (
            <Context.Consumer>
                {({id, form, statePath, valuesToModel, deactivate}) =>
                    <FormPanel
                        id={id}
                        className={className}
                        form={form}
                        close={deactivate}
                        placement={placement}
                        onApply={values => this.onApply({id, statePath, values, valuesToModel})}>
                        {children}
                    </FormPanel>
                }
            </Context.Consumer>
        )
    }

    onApply({id, statePath, values, valuesToModel}) {
        const {onApply} = this.props
        const model = valuesToModel(values)
        setModelAndValues({id, statePath, model, values})
        onApply && onApply(values, model)
    }
}

const setModelAndValues = ({id, statePath, model, values}) =>
    actionBuilder('SET_MODEL_AND_VALUES', {id, model, values})
        .set([statePath, 'ui', id], values)
        .set([statePath, 'model', id], model)
        .dispatch()


const setDirty = ({id, statePath, dirty}) =>
    actionBuilder('SET_DIRTY', {id, dirty})
        .set([statePath, 'ui', id, 'dirty'], dirty)
        .dispatch()
