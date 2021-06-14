import {RecipeContext} from 'app/home/body/process/recipeContext'
import {RecipeHome} from './recipeHome'
import {StaticMap} from 'app/home/map/staticMap'
import {Tabs} from 'widget/tabs/tabs'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {getRecipeType} from './recipeTypes'
import {getTabsInfo} from 'widget/tabs/tabs'
import {msg} from 'translate'
import {recipePath, saveRecipe} from './recipe'
import {select} from '../../../../store'
import CloseRecipe from './closeRecipe'
import ProcessMenu from './processMenu'
import React from 'react'
import Revisions from 'app/home/body/process/revisions'
import SaveRecipe from './saveRecipe'

export const getProcessTabsInfo = () => getTabsInfo('process')

class Process extends React.Component {
    render() {
        return (
            <React.Fragment>
                <Tabs
                    label={msg('home.sections.process')}
                    statePath='process'
                    isLandingTab={({type}) => !type}
                    tabActions={recipeId => this.renderMenu(recipeId)}
                    onTitleChanged={tab => saveRecipe(tab)}
                    onClose={(tab, close) => this.onCloseTab(tab, close)}
                >
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

    renderMenu(recipeId) {
        return (
            <RecipeContext recipeId={recipeId}>
                <ProcessMenu recipeId={recipeId}/>
                <Revisions recipeId={recipeId}/>
            </RecipeContext>
        )
    }

    renderRecipe(recipeId, type) {
        return type
            ? this.renderRecipeByType(recipeId, type)
            : this.renderRecipeHome(recipeId)
    }

    renderRecipeByType(recipeId, type) {
        const component = getRecipeType(type).components.recipe
        const props = {recipeId}
        return React.createElement(component, props)
    }

    renderRecipeHome(recipeId) {
        return (
            <StaticMap>
                <RecipeHome recipeId={recipeId}/>
            </StaticMap>
        )
    }

    onCloseTab(tab, close) {
        const {activator: {activatables: {closeRecipeDialog}}} = this.props
        const recipe = {
            ...select(recipePath(tab.id)),
            title: tab.title
        }
        const unsaved = recipe.ui && recipe.ui.unsaved && recipe.ui.initialized
        if (unsaved) {
            closeRecipeDialog.activate({recipe})
        } else {
            close()
        }
    }
}

export default compose(
    Process,
    activator('closeRecipeDialog')
)
