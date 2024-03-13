import {CloseRecipe} from './closeRecipe'
import {Notifications} from '~/widget/notifications'
import {ProcessMenu} from './processMenu'
import {Recipe} from '~/app/home/body/process/recipeContext'
import {RecipeHome} from './recipeHome'
import {Revisions} from '~/app/home/body/process/revisions'
import {SaveRecipe} from './saveRecipe'
import {Tabs} from '~/widget/tabs/tabs'
import {compose} from '~/compose'
import {getRecipeType} from './recipeTypeRegistry'
import {loadProjects$, loadRecipes$, recipePath, saveRecipe} from './recipe'
import {msg} from '~/translate'
import {registerImageLayerSources} from './imageLayerSources'
import {registerRecipeImageLayers} from './recipeImageLayers'
import {registerRecipeTypes} from './recipeTypes'
import {select} from '~/store'
import {withActivators} from '~/widget/activation/activator'
import {withLeaveAlert} from '~/widget/leaveAlert'
import React from 'react'
import _ from 'lodash'

class _Process extends React.Component {
    constructor(props) {
        super(props)
        this.isLandingTab = this.isLandingTab.bind(this)
        this.renderMenu = this.renderMenu.bind(this)
        this.renderTab = this.renderTab.bind(this)
        this.onCloseTab = this.onCloseTab.bind(this)
        registerRecipeTypes()
        registerRecipeImageLayers()
        registerImageLayerSources()
    }

    render() {
        return (
            <React.Fragment>
                <Tabs
                    label={msg('home.sections.process')}
                    statePath='process'
                    isLandingTab={this.isLandingTab}
                    tabActions={this.renderMenu}
                    onTitleChanged={saveRecipe}
                    onClose={this.onCloseTab}>
                    {this.renderTab}
                </Tabs>
                <CloseRecipe/>
                <SaveRecipe/>
            </React.Fragment>
        )
    }

    isLandingTab({type}) {
        return !type
    }

    renderTab({id, type}) {
        return (
            <Recipe id={id}>
                {this.renderRecipe(id, type)}
            </Recipe>
        )
    }

    renderMenu(recipeId) {
        return (
            <Recipe id={recipeId}>
                <ProcessMenu recipeId={recipeId}/>
                <Revisions recipeId={recipeId}/>
            </Recipe>
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

export const Process = compose(
    _Process,
    withActivators('closeRecipeDialog'),
    withLeaveAlert(mapStateToLeaveAlert)
)
