import {Map} from '../../map/map'
import {RecipeContext} from 'app/home/body/process/recipeContext'
import {RecipeHome} from './recipeHome'
import {Tabs} from 'widget/tabs/tabs'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {getRecipeType} from './recipeTypes'
import {getTabsInfo} from 'widget/tabs/tabs'
import {msg} from 'translate'
import {saveRecipe} from './recipe'
import CloseRecipe from './closeRecipe'
import ProcessMenu from './processMenu'
import React from 'react'
import Revisions from 'app/home/body/process/revisions'
import SaveRecipe from './saveRecipe'

export const getProcessTabsInfo = () => getTabsInfo('process')

class Process extends React.Component {
    renderRecipeByType(recipeId, type) {
        const component = getRecipeType(type).components.recipe
        const props = {recipeId}
        return React.createElement(component, props)
    }

    renderRecipe(recipeId, type) {
        return type
            ? this.renderRecipeByType(recipeId, type)
            : <RecipeHome recipeId={recipeId}/>
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
                    isLandingTab={({type}) => !type}
                    tabActions={recipeId => this.renderMenu(recipeId)}
                    onTitleChanged={recipe => saveRecipe(recipe)}
                    onClose={(recipe, close) => this.onCloseTab(recipe, close)}
                >
                    {({id, type}) =>
                        <RecipeContext recipeId={id}>
                            <Map>
                                {this.renderRecipe(id, type)}
                            </Map>
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
