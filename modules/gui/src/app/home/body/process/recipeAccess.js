import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {initializeRecipe} from './recipe'
import {map, of, switchMap, tap} from 'rxjs'
import {selectFrom} from '~/stateUtils'
import {v4 as uuid} from 'uuid'
import React from 'react'
import _ from 'lodash'
import api from '~/apiRegistry'

let componentIdsByRecipeId = {}

const componentIdsForRecipeId = recipeId => Array.from(
    componentIdsByRecipeId[recipeId] || new Set([])
)

const mapStateToProps = state => ({
    loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {}
})

export const recipeAccess = () =>
    WrappedComponent => compose(
        class RecipeAccessHOC extends React.Component {
            constructor(props) {
                super(props)
                this.componentId = uuid()
            }

            render() {
                const {loadedRecipes} = this.props
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    usingRecipe: recipeId => this.usingRecipe(recipeId),
                    loadRecipe$: recipeId => this.loadRecipe$(recipeId),
                    loadSourceRecipe$: recipeId => this.loadSourceRecipe$(recipeId),
                    loadedRecipes
                })
            }

            componentWillUnmount() {
                const updatedComponentIdsByRecipeId = {}
                Object.keys(componentIdsByRecipeId)
                    .forEach(recipeId => {
                        const componentIds = new Set(
                            componentIdsForRecipeId(recipeId)
                                .filter(componentId => componentId !== this.componentId)
                        )
                        if (_.isEmpty(componentIds)) {
                            this.removeCachedRecipe(recipeId)
                        } else {
                            updatedComponentIdsByRecipeId[recipeId] = componentIds
                        }
                    })
                componentIdsByRecipeId = updatedComponentIdsByRecipeId
            }

            usingRecipe(recipeId) {
                componentIdsByRecipeId = {
                    ...componentIdsByRecipeId,
                    [recipeId]: new Set([
                        ...componentIdsForRecipeId(recipeId),
                        this.componentId
                    ])
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

            loadSourceRecipe$(recipeId) {
                const {getRecipeType} = require('./recipeTypeRegistry')
                return this.loadRecipe$(recipeId).pipe(
                    switchMap(recipe => {
                        const type = getRecipeType(recipe.type)
                        const sourceRecipe = type?.sourceRecipe && type.sourceRecipe(recipe)
                        if (sourceRecipe) {
                            if (sourceRecipe.type === 'ASSET') {
                                return of(sourceRecipe)
                            } else {
                                return this.loadSourceRecipe$(sourceRecipe.id)
                            }
                        } else {
                            this.cacheRecipe(recipe)
                            return of(recipe)
                        }
                    })
                )
            }

            cacheRecipe(recipe) {
                const prevComponentIds = componentIdsForRecipeId(recipe.id)
                componentIdsByRecipeId = {
                    ...componentIdsByRecipeId,
                    [recipe.id]: new Set([
                        ...prevComponentIds,
                        this.componentId
                    ])
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
        },
        connect(mapStateToProps)
    )
