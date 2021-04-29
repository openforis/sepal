import {compose} from 'compose'
import {connect} from 'store'
import {recipeAccess} from '../recipeAccess'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'

const mapStateToProps = (state, {source: {sourceConfig: {recipeId}}}) => ({
    recipe: selectFrom(state, ['process.loadedRecipes', recipeId])
})

// TODO: Not mounted unless showing layer. Cannot deal with description here
class _RecipeImageLayerSource extends React.Component {
    render() {
        return null
    }

    componentDidMount() {
        this.loadRecipe()
    }

    componentDidUpdate(prevProps) {
        const {recipe: prevRecipe} = prevProps
        const {stream, recipe} = this.props
        if (!stream('LOAD_RECIPE').active && (!recipe || recipe.id !== prevRecipe.id)) {
            this.loadRecipe()
        }
        if (recipe && toDescription(recipe) !== toDescription(prevRecipe)) {
            this.updateRecipeDescription(recipe)
        }
    }

    loadRecipe() {
        const {stream, source: {sourceConfig: {recipeId}}, loadRecipe$} = this.props
        stream('LOAD_RECIPE',
            loadRecipe$(recipeId),
            recipe => this.updateRecipeDescription(recipe)
            // TODO: Handle errors
        )
    }

    updateRecipeDescription(recipe) {
        const {recipeId, source, recipeActionBuilder} = this.props
        const description = toDescription(recipe)
        if (recipeId !== source.sourceConfig.recipeId) {
            console.log({source})
            recipeActionBuilder('UPDATE_RECIPE_IMAGE_LAYER__SOURCE_DESCRIPTION', {description})
                .set(['layers.additionalImageLayerSources', {id: source.id}, 'sourceConfig.description'], description)
                .dispatch()
        }
    }
}

export const RecipeImageLayerSource = compose(
    _RecipeImageLayerSource,
    connect(mapStateToProps),
    withRecipe(),
    recipeAccess()
)

RecipeImageLayerSource.propTypes = {
    source: PropTypes.object.isRequired
}

const toDescription = recipe =>
    recipe && (recipe.title || recipe.placeholder)
