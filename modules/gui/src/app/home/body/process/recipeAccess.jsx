import _ from 'lodash'
import React from 'react'
import {map, of, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {uuid} from '~/uuid'

import {isRecipeOpen, recipePath} from './recipe'
import {ABSENT, cacheAcceptance, DRAFT, initializeRecipe, KEEP, saveStatePath} from './recipeCache'

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
                    reloadRecipe$: recipeId => this.reloadRecipe$(recipeId),
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

            // Reads the persisted recipe even when this cache holds one, and replaces what it holds. For a
            // caller that has learned the cached record is behind - a newer revision in the catalogue - and
            // must not go on answering from it. The caller decides that; this only knows how to refresh.
            reloadRecipe$(recipeId) {
                this.usingRecipe(recipeId)
                return api.recipe.load$(recipeId).pipe(
                    map(recipe => initializeRecipe(recipe)),
                    map(recipe => this.acceptReload(recipe))
                )
            }

            // Whether the response may be written is decided when it ARRIVES, not when it was asked for
            // (recipeCache.js). The recipe can be opened for editing while the read is in flight, and a draft - open, or
            // closed while its saves are unsettled - is not something a dependency read may overwrite; nor may an older response
            // replace a newer copy. The caller is handed what the session holds instead, so it goes on reading
            // what the session is actually using. This consumer asked for the recipe, so it retains what it adds.
            acceptReload(recipe) {
                const held = select(recipePath(recipe.id))
                const saveState = select(saveStatePath(recipe.id))
                switch (cacheAcceptance({record: recipe, cached: held, open: isRecipeOpen(recipe.id), saveState})) {
                    case DRAFT:
                        return held || recipe
                    case KEEP:
                        return held
                    case ABSENT:
                    default:
                        this.cacheRecipe(recipe)
                        return recipe
                }
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
