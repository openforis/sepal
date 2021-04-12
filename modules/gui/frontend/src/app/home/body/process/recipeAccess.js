import {compose} from 'compose'
import {connect} from 'store'
import {initializeRecipe} from './recipe'
import {map, tap} from 'rxjs/operators'
import {of} from 'rxjs'
import {selectFrom} from 'stateUtils'
import React from 'react'
import actionBuilder from 'action-builder'
import api from 'api'
import guid from 'guid'

let componentIdsByRecipeId = {}

const mapStateToProps = state => {
    return {
        loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {}
    }
}

export const recipeAccess = () =>
    WrappedComponent => {
        class HigherOrderComponent extends React.Component {
            constructor(props) {
                super(props)
                this.componentId = guid()
            }

            render() {
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    usingRecipe: recipeId => this.usingRecipe(recipeId),
                    loadRecipe$: recipeId => this.loadRecipe$(recipeId)
                })
            }

            componentWillUnmount() {
                const updatedComponentIdsByRecipeId = {}
                Object.keys(componentIdsByRecipeId)
                    .forEach(recipeId => {
                        const componentIds = new Set(
                            Array.from((componentIdsByRecipeId[recipeId] || new Set([])))
                                .filter(componentId => componentId !== this.id)
                        )
                        if (componentIds.length) {
                            updatedComponentIdsByRecipeId[recipeId] = componentIds
                        } else {
                            this.removeCachedRecipe(recipeId)
                        }
                    })
                componentIdsByRecipeId = updatedComponentIdsByRecipeId
            }

            usingRecipe(recipeId) {
                componentIdsByRecipeId = {
                    ...componentIdsByRecipeId,
                    [recipeId]: new Set(componentIdsByRecipeId[recipeId] || [])
                }
            }

            loadRecipe$(recipeId) {
                const {loadedRecipes} = this.props
                this.usingRecipe(recipeId)
                return Object.keys(loadedRecipes).includes(recipeId)
                    ? of(loadedRecipes[recipeId])
                    : api.recipe.load$(recipeId).pipe(
                        map(recipe => initializeRecipe(recipe)),
                        tap(recipe => this.cacheRecipe(recipe))
                    )
            }

            cacheRecipe(recipe) {
                const prevComponentIds = componentIdsByRecipeId[recipe.id] || []
                componentIdsByRecipeId = {
                    ...componentIdsByRecipeId,
                    [recipe.id]: [...prevComponentIds, this.componentId]
                }
                actionBuilder('CACHE_RECIPE', recipe)
                    .set(['process.loadedRecipes', recipe.id], recipe)
                    .dispatch()
            }

            removeCachedRecipe(recipeId) {
                actionBuilder('REMOVE_CACHE_RECIPE', recipeId)
                    .del(['process.loadedRecipes', recipeId])
                    .dispatch()
            }
        }

        return compose(
            HigherOrderComponent,
            connect(mapStateToProps)
        )
    }
