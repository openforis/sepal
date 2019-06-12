import {RecipeContext} from 'app/home/body/process/recipeContext'
import Revisions from 'app/home/body/process/revisions'
import {compose} from 'compose'
import React from 'react'
import {msg} from 'translate'
import {activator} from 'widget/activation/activator'
import Tabs from 'widget/tabs'
import CloseRecipe from './closeRecipe'
import ProcessMenu from './processMenu'
import {saveRecipe} from './recipe'
import Recipes from './recipes'
import {getRecipeType} from './recipeTypes'
import SaveRecipe from './saveRecipe'

class Process extends React.Component {
    renderRecipeList(id) {
        return <Recipes recipeId={id}/>
    }

    renderRecipeByType(type) {
        return React.createElement(
            getRecipeType(type).components.recipe
        )
    }

    renderRecipe(id, type) {
        return type
            ? this.renderRecipeByType(type)
            : this.renderRecipeList(id)

    }

    renderMenu(recipeId) {
        return (
            <RecipeContext recipeId={recipeId}>
                <ProcessMenu recipeId={recipeId}/>
                <Revisions recipeId={recipeId}/>
            </RecipeContext>
        )
    }

    onCloseTab(recipe, close) {
        const {activator: {activatables: {closeRecipeDialog}}} = this.props
        const unsaved = recipe.ui && recipe.ui.unsaved && recipe.ui.initialized
        if (unsaved) {
            closeRecipeDialog.activate({recipe})
        } else {
            close()
        }
    }

    render() {
        return (
            <React.Fragment>
                <Tabs
                    label={msg('home.sections.process')}
                    statePath='process'
                    tabActions={recipeId => this.renderMenu(recipeId)}
                    onTitleChanged={recipe => saveRecipe(recipe)}
                    onClose={(recipe, close) => this.onCloseTab(recipe, close)}>
                    {({id, type}) =>
                        <RecipeContext recipeId={id}>
                            {this.renderRecipe(id, type)}
                        </RecipeContext>
                    }
                </Tabs>
                <CloseRecipe/>
                <SaveRecipe/>
            </React.Fragment>
        )
    }
}

export default compose(
    Process,
    activator('closeRecipeDialog')
)
