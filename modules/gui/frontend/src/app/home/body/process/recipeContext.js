import {ActivationContext} from 'widget/activation/activationContext'
import {connect, select} from 'store'
import React from 'react'
import actionBuilder from 'action-builder'

export const RecipeContext = ({recipeId, rootStatePath, children}) =>
    <Context.Provider value={toContextValue(recipeId, statePath(recipeId, rootStatePath))}>
        {children}
    </Context.Provider>

export const withRecipeContext = () =>
    WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Context.Consumer>
                        {recipeContext =>
                            <ActivationContext statePath={[recipeContext.statePath, 'ui']}>
                                {React.createElement(WrappedComponent, {
                                    ...this.props,
                                    recipeContext
                                })}
                            </ActivationContext>
                        }
                    </Context.Consumer>
                )
            }
        }
        return HigherOrderComponent
    }

export const recipe = ({defaultModel, mapRecipeToProps}) =>
    WrappedComponent => {
        const mapStateToProps = (state, ownProps) => {
            const {recipeContext: {statePath}} = ownProps
            const hasModel = !!select([statePath, 'model'])
            return {hasModel}
        }

        class HigherOrderComponent extends React.Component {
            render() {
                const {hasModel} = this.props
                return hasModel
                    ? React.createElement(WrappedComponent, this.props)
                    : null
            }

            componentDidMount() {
                const {hasModel, recipeContext: {statePath}} = this.props
                if (!hasModel) {
                    actionBuilder('INIT_MODEL', defaultModel)
                        .set([statePath, 'model'], defaultModel)
                        .dispatch()
                }
            }
        }

        return withRecipe(mapRecipeToProps)(
            connect(mapStateToProps)(
                HigherOrderComponent
            )
        )
    }

export const withRecipe = mapRecipeToProps =>
    WrappedComponent => {
        const mapStateToProps = (state, ownProps) => {
            const {recipeContext: {statePath}} = ownProps
            const recipe = {...select(statePath)}
            return mapRecipeToProps(recipe, ownProps)
        }

        const ConnectedComponent = connect(mapStateToProps)(WrappedComponent)
        return withRecipeContext()(ConnectedComponent)
    }

const Context = React.createContext()

const toContextValue = (recipeId, statePath) => ({
    recipeId,
    statePath
})

const statePath = (recipeId, rootStatePath) => {
    const recipeTabIndex = select(rootStatePath)
        .findIndex(recipe => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        throw new Error(`Recipe not found: ${recipeId}`)
    return [rootStatePath, recipeTabIndex]
        .filter(e => e !== undefined)
        .join('.')
}
