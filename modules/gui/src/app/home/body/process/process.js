import {RecipeContext} from 'app/home/body/process/recipeContext'
import {RecipeHome} from './recipeHome'
import {Tabs, getTabsInfo} from 'widget/tabs/tabs'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {getRecipeType} from './recipeTypes'
import {loadProjects$, loadRecipes$, recipePath, saveRecipe} from './recipe'
import {msg} from 'translate'
import {select} from '../../../../store'
import {withLeaveAlert} from 'widget/leaveAlert'
import CloseRecipe from './closeRecipe'
import Notifications from 'widget/notifications'
import ProcessMenu from './processMenu'
import React from 'react'
import Revisions from 'app/home/body/process/revisions'
import SaveRecipe from './saveRecipe'
import _ from 'lodash'

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
                    onClose={(tab, close) => this.onCloseTab(tab, close)}>
                    {({id, type}) => (
                        <RecipeContext recipeId={id}>
                            {this.renderRecipe(id, type)}
                        </RecipeContext>
                    )}
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
            <RecipeHome recipeId={recipeId}/>
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

    componentDidMount() {
        const {projects, recipes, stream} = this.props
        if (!projects) {
            stream('LOAD_PROJECTS',
                loadProjects$(),
                null,
                () => Notifications.error({message: msg('process.project.loadingError'), timeout: -1})
            )
        }
        if (!recipes) {
            stream('LOAD_RECIPES',
                loadRecipes$(),
                null,
                () => Notifications.error({message: msg('process.recipe.loadingError'), timeout: -1})
            )
        }
    }
}

const mapStateToLeaveAlert = () => {
    const loadedRecipes = select('process.loadedRecipes') || {}
    const unsavedRecipeCount = _(loadedRecipes)
        .values()
        .map(recipe => recipe.ui && recipe.ui.unsaved)
        .filter(unsaved => unsaved)
        .size()
    return unsavedRecipeCount > 0
}

export default compose(
    Process,
    activator('closeRecipeDialog'),
    withLeaveAlert(mapStateToLeaveAlert)
)
