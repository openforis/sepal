import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {select} from '~/store'
import {msg} from '~/translate'
import {withActivators} from '~/widget/activation/activator'
import {Menu} from '~/widget/menu'
import {Notifications} from '~/widget/notifications'

import {duplicateRecipe, exportRecipe$, RecipeState} from './recipe'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        recipe: recipeState && recipeState(),
        recipes: select('process.recipes')
    }
}

class _ProcessMenu extends React.Component {
    constructor() {
        super()
        this.duplicateRecipe = this.duplicateRecipe.bind(this)
        this.exportRecipe = this.exportRecipe.bind(this)
        this.save = this.save.bind(this)
    }

    render() {
        const {recipe} = this.props
        if (recipe && recipe.type && recipe.ui.initialized) {
            return (
                <Menu>
                    {this.isRecipeUnsaved()
                        ? this.renderUnsavedRecipeItems()
                        : this.renderSavedRecipeItems()}
                    <Menu.Item onSelect={this.duplicateRecipe}>
                        {msg('process.menu.duplicateRecipe.label')}
                    </Menu.Item>
                    <Menu.Item onSelect={this.exportRecipe}>
                        {msg('process.menu.exportRecipe')}
                    </Menu.Item>
                </Menu>
            )
        } else {
            return <Menu disabled/>
        }
    }

    renderUnsavedRecipeItems() {
        return (
            <Menu.Item onSelect={this.save}>
                {msg('process.menu.saveRecipe')}
            </Menu.Item>
        )
    }

    renderSavedRecipeItems() {
        const {activator: {activatables: {revisions: {activate}}}} = this.props
        return (
            <Menu.Item onSelect={activate}>
                {msg('process.menu.revertToOldRevision')}
            </Menu.Item>
        )
    }

    save() {
        const {recipe, activator: {activatables: {saveRecipeDialog}}} = this.props
        saveRecipeDialog.activate({recipe, closeTabOnSave: false})
    }

    isRecipeUnsaved() {
        const {recipe, recipes} = this.props
        return !(recipes && recipes.find(saved => saved.id === recipe.id))
    }

    duplicateRecipe() {
        const {recipe} = this.props
        duplicateRecipe(recipe)
    }

    exportRecipe() {
        const {recipe, stream} = this.props
        stream({
            name: 'EXPORT_RECIPE',
            stream$: exportRecipe$(recipe),
            onComplete: () => Notifications.success({message: msg('process.recipe.export.success')}),
            onError: error => Notifications.error({message: msg('process.recipe.export.error'), error})
        })
    }
}

export const ProcessMenu = compose(
    _ProcessMenu,
    connect(mapStateToProps),
    withActivators('saveRecipeDialog', 'revisions')
)
