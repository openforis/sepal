import {Activator, activator} from 'widget/activation/activator'
import {Msg} from 'translate'
import {RecipeState, addRecipe, exportRecipe$} from './recipe'
import {connect, select} from 'store'
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
        if (recipe && recipe.type && recipe.ui.initialized) {
            const unsaved = this.isRecipeUnsaved()
            return (
                <Menu>
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
        const {recipe, activator: {activatables: {saveRecipeDialog}}} = this.props
        return (
            <MenuItem onSelect={() => saveRecipeDialog.activate({recipe, closeTabOnSave: false})}>
                <Msg id='process.menu.saveRecipe'/>
            </MenuItem>
        )
    }

    renderSavedRecipeItems() {
        return (
            <Activator id='revisions'>
                {({activate}) =>
                    <MenuItem onSelect={() => activate()}>
                        <Msg id='process.menu.revertToOldRevision'/>
                    </MenuItem>
                }
            </Activator>
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

export default (
    activator(['saveRecipeDialog'])(
        connect(mapStateToProps)(
            ProcessMenu
        )
    )
)
