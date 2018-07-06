import React from 'react'
import {connect, select} from 'store'
import Menu, {MenuItem} from 'widget/menu'
import {exportRecipe, RecipeState, saveRecipe} from './recipe'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState && recipeState(),
        recipes: select('process.recipes')
    }
}

class ProcessMenu extends React.Component {
    render() {
        const {recipe} = this.props
        if (recipe && recipe.type) {
            const unsaved = this.isRecipeUnsaved()
            return (
                <Menu warning={unsaved ? 'Recipe is not saved.' : null}>
                    {unsaved
                        ? this.renderUnsavedRecipeItems()
                        : this.renderSavedRecipeItems()}
                    <MenuItem onClick={() => exportRecipe(recipe)}>Export recipe</MenuItem>
                </Menu>
            )
        } else
            return null
    }

    renderUnsavedRecipeItems() {
        const {recipe} = this.props
        return <MenuItem onClick={() => saveRecipe(recipe)}>Save recipe</MenuItem>
    }

    renderSavedRecipeItems() {
        return <MenuItem>Revert to old revision...</MenuItem>

    }

    isRecipeUnsaved() {
        const {recipe, recipes} = this.props
        return !recipes.find(saved => saved.id === recipe.id)
    }
}

export default connect(mapStateToProps)(ProcessMenu)