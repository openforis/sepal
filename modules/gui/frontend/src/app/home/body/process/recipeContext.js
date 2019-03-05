import actionBuilder from 'action-builder'
import React from 'react'
import {connect, select} from 'store'
import {ActivationContext} from 'widget/activation/activationContext'

export const RecipeContext = ({recipeId, rootStatePath, children}) => {
    const statePath = getStatePath(recipeId, rootStatePath)
    return recipeId
        ? (
            <Context.Provider value={toContextValue(recipeId, statePath)}>
                <ActivationContext id={'recipe-' + recipeId}>
                    {children}
                </ActivationContext>
            </Context.Provider>
        )
        : null
}

export const withRecipeContext = () =>
    WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            render() {
                return (
                    <Context.Consumer>
                        {recipeContext =>
                            React.createElement(WrappedComponent, {
                                ...this.props,
                                recipeContext
                            })
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

const getStatePath = (recipeId, rootStatePath) => {
    const recipeTabIndex = select(rootStatePath)
        .findIndex(recipe => recipe.id === recipeId)
    if (recipeTabIndex === -1)
        return 'foo'
    // throw new Error(`Recipe not found: ${recipeId}`)
    return [rootStatePath, recipeTabIndex]
        .filter(e => e !== undefined)
        .join('.')
}
