import {ActivationContext} from 'widget/activation/activationContext'
import {compose} from 'compose'
import {connect, select} from 'store'
import {recipeAccess} from './recipeAccess'
import {recipeActionBuilder} from './recipe'
import {toPathList} from 'stateUtils'
import {withContext} from 'context'
import React from 'react'
import _ from 'lodash'
import actionBuilder from 'action-builder'

const Context = React.createContext()
 
export const Recipe = ({id, children}) =>
    id
        ? (
            <Context.Provider value={toPathList(['process.loadedRecipes', id])}>
                <ActivationContext id={`recipe-${id}`}>
                    {children}
                </ActivationContext>
            </Context.Provider>
        )
        : null

const withRecipeContext = withContext(Context, 'recipeContext')

export const withRecipe = (mapRecipeToProps = () => ({})) =>
    WrappedComponent => {
        const mapStateToProps = (_state, ownProps) => {
            const {recipeContext: {statePath}} = ownProps
            const recipe = {...select(statePath)}
            if (!_.isEmpty(recipe)) {
                return {
                    recipeActionBuilder: recipeActionBuilder(recipe.id),
                    recipeId: recipe.id,
                    ...mapRecipeToProps(recipe, ownProps)
                }
            } else {
                return ownProps
            }
        }
        return compose(
            class WithRecipeHOC extends React.Component {
                constructor(props) {
                    super(props)
                    const {recipeId, usingRecipe} = props
                    usingRecipe(recipeId)
                }
    
                render() {
                    return React.createElement(WrappedComponent, {...this.props})
                }
            },
            connect(mapStateToProps),
            withRecipeContext(),
            recipeAccess()
        )
    }

export const recipe = ({getDefaultModel, defaultModel, mapRecipeToProps}) =>
    WrappedComponent => {
        const mapStateToProps = (state, ownProps) => {
            const {recipeContext: {statePath}} = ownProps
            const hasModel = !!select([statePath, 'model'])
            return {hasModel}
        }

        return compose(
            class RecipeHOC extends React.Component {
                render() {
                    const {hasModel} = this.props
                    return hasModel
                        ? React.createElement(WrappedComponent, this.props)
                        : null
                }
    
                componentDidMount() {
                    const {hasModel, recipeContext: {statePath}} = this.props
                    if (!hasModel) {
                        actionBuilder('INIT_MODEL', defaultModel || (getDefaultModel && getDefaultModel()))
                            .set([statePath, 'model'], defaultModel || (getDefaultModel && getDefaultModel()))
                            .dispatch()
                    }
                }
            },
            connect(mapStateToProps),
            withRecipe(mapRecipeToProps)
        )
    }
