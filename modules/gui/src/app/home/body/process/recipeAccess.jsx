import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'

import {sessionRecipeCache} from './recipe'
import {RecipeCacheClaimant} from './recipeCacheClaims'

// A component's claim on the session's recipe cache, held while it is mounted (recipeCacheClaims.js).

const mapStateToProps = state => ({
    loadedRecipes: selectFrom(state, 'process.loadedRecipes') || {}
})

export const recipeAccess = () =>
    WrappedComponent => compose(
        class RecipeAccessHOC extends React.Component {
            claimant = new RecipeCacheClaimant(sessionRecipeCache)

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
