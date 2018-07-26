import {showRevisionsPanel} from 'app/home/body/process/revisions'
import React from 'react'
import {connect, select} from 'store'
import {Msg, msg} from 'translate'
import Menu, {MenuItem} from 'widget/menu'
import {addRecipe, exportRecipe, RecipeState, saveRecipe} from './recipe'

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
                <Menu warning={unsaved ? msg('process.menu.recipeNotSaved') : null}>
                    {unsaved
                        ? this.renderUnsavedRecipeItems()
                        : this.renderSavedRecipeItems()}
                    <MenuItem onSelect={() => this.duplicateRecipe()}>
                        <Msg id='process.menu.duplicateRecipe'/>
                    </MenuItem>
                    <MenuItem onSelect={() => exportRecipe(recipe)}>
                        <Msg id='process.menu.exportRecipe'/>
                    </MenuItem>
                </Menu>
            )
        } else
            return null
    }

    renderUnsavedRecipeItems() {
        const {recipe} = this.props
        return (
            <MenuItem onSelect={() => saveRecipe(recipe)}>
                <Msg id='process.menu.saveRecipe'/>
            </MenuItem>
        )
    }

    renderSavedRecipeItems() {
        const {recipe} = this.props
        return (
            <MenuItem onSelect={() => showRevisionsPanel(recipe.id)}>
                <Msg id='process.menu.revertToOldRevision'/>
            </MenuItem>
        )
    }

    isRecipeUnsaved() {
        const {recipe, recipes} = this.props
        return !recipes.find(saved => saved.id === recipe.id)
    }

    duplicateRecipe() {
        const {recipe} = this.props
        const duplicate = ({
            ...recipe,
            title: (recipe.title || recipe.placeholder) + '_copy'
        })
        return addRecipe(duplicate)
    }
}

export default connect(mapStateToProps)(ProcessMenu)