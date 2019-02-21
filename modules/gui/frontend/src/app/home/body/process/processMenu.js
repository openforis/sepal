import {Msg, msg} from 'translate'
import {RecipeState, addRecipe, exportRecipe$, saveRecipe} from './recipe'
import {connect, select} from 'store'
import {showRevisionsPanel} from 'app/home/body/process/revisions'
import Menu, {MenuItem} from 'widget/menu'
import React from 'react'

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
                    <MenuItem onSelect={() => this.exportRecipe(recipe)}>
                        <Msg id='process.menu.exportRecipe'/>
                    </MenuItem>
                </Menu>
            )
        } else {
            return <Menu disabled/>
        }
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
        return !(recipes && recipes.find(saved => saved.id === recipe.id))
    }

    exportRecipe() {
        const {recipe, stream} = this.props
        stream('EXPORT_RECIPE', exportRecipe$(recipe))
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
