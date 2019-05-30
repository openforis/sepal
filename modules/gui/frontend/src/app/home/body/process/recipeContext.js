import {ActivationContext} from 'widget/activation/activationContext'
import {compose} from 'compose'
import {connect, select} from 'store'
import {toPathList} from 'stateUtils'
import React from 'react'
import actionBuilder from 'action-builder'
import withContext from 'context'

const Context = React.createContext()

export const RecipeContext = ({rootStatePath = 'process.tabs', recipeId, children}) =>
    recipeId
        ? (
            <Context.Provider value={{
                statePath: toPathList([rootStatePath, {id: recipeId}])
            }}>
                <ActivationContext id={'recipe-' + recipeId}>
                    {children}
                </ActivationContext>
            </Context.Provider>
        )
        : null
    
export const withRecipe = mapRecipeToProps =>
    WrappedComponent => {
        const withRecipeContext = withContext(Context, 'recipeContext')
        const mapStateToProps = (state, ownProps) => {
            const {recipeContext: {statePath}} = ownProps
            const recipe = {...select(statePath)}
            return mapRecipeToProps(recipe, ownProps)
        }
        return compose(
            WrappedComponent,
            connect(mapStateToProps),
            withRecipeContext()
        )
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

        return compose(
            HigherOrderComponent,
            connect(mapStateToProps),
            withRecipe(mapRecipeToProps)
        )
    }
