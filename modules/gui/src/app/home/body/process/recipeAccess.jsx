import React from 'react'

import {actionBuilder} from '~/action-builder'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {select} from '~/store'

import {isRecipeOpen, recipePath} from './recipe'
import {saveStatePath} from './recipeCache'
import {RecipeCacheClaimant} from './recipeCacheClaims'

// A component's claim on the session's recipe cache, held while it is mounted (recipeCacheClaims.js).

const mapStateToProps = state => ({
    loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {}
})

const SESSION_CACHE = {
    held: recipeId => select(recipePath(recipeId)),
    open: recipeId => isRecipeOpen(recipeId),
    saveState: recipeId => select(saveStatePath(recipeId)),
    write: recipe => actionBuilder('CACHE_RECIPE', recipe)
        .set(['process.loadedRecipes', recipe.id], recipe)
        .dispatch(),
    remove: recipeId => actionBuilder('REMOVE_CACHE_RECIPE', recipeId)
        .del(['process.loadedRecipes', recipeId])
        .dispatch()
}

export const recipeAccess = () =>
    WrappedComponent => compose(
        class RecipeAccessHOC extends React.Component {
            claimant = new RecipeCacheClaimant(SESSION_CACHE)

            render() {
                const {loadedRecipes} = this.props
                return React.createElement(WrappedComponent, {
                    ...this.props,
                    usingRecipe: recipeId => this.claimant.use(recipeId),
                    loadRecipe$: recipeId => this.claimant.load$(recipeId),
                    reloadRecipe$: recipeId => this.claimant.reload$(recipeId),
                    loadedRecipes
                })
            }

            componentWillUnmount() {
                this.claimant.release()
            }
        },
        connect(mapStateToProps)
    )
