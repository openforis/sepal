import _ from 'lodash'
import React from 'react'
import {map, of, switchMap, tap} from 'rxjs'

import {actionBuilder} from '~/action-builder'
import api from '~/apiRegistry'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'
import {uuid} from '~/uuid'

import {initializeRecipe, isRecipeOpen, recipePath} from './recipe'
import {getRecipeType} from './recipeTypeRegistry'

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

            // Whether the response may be written is decided when it ARRIVES, not when it was asked for. The
            // recipe can be opened for editing while the read is in flight, and the draft the user is now
            // working on is not something a dependency read may overwrite. The caller is handed that draft
            // instead, so it goes on reading what the session is actually editing.
            acceptReload(recipe) {
                if (isRecipeOpen(recipe.id)) {
                    return select(recipePath(recipe.id)) || recipe
                }
                this.cacheRecipe(recipe)
                return recipe
            }

            loadSourceRecipe$(recipeId) {
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
