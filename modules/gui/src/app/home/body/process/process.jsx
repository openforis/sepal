import React from 'react'

import {Recipe, recipeActivationPath} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {select} from '~/store'
import {msg} from '~/translate'
import {withActivationContext} from '~/widget/activation/activationContext'
import {activateIn} from '~/widget/activation/activator'
import {withLeaveAlert} from '~/widget/leaveAlert'
import {Notifications} from '~/widget/notifications'
import {Tabs} from '~/widget/tabs/tabs'

import {CloseRecipe} from './closeRecipe'
import {registerImageLayerSources} from './imageLayerSources'
import {MoveRecipe} from './moveRecipe'
import {ProcessMenu} from './processMenu'
import {hasUnsavedWork, loadFolders$, loadRecipes$, recipePath, saveRecipe} from './recipe'
import {RecipeHome} from './recipeHome'
import {registerRecipeImageLayers} from './recipeImageLayers'
import {RecipeTabTooltip} from './recipeLocation'
import {getRecipeType} from './recipeTypeRegistry'
import {registerRecipeTypes} from './recipeTypes'
import {SaveRecipe} from './saveRecipe'
import {SourceRuntimeProvider} from './sourceRuntime/sourceRuntimeContext'

class _Process extends React.Component {
    constructor(props) {
        super(props)
        this.isLandingTab = this.isLandingTab.bind(this)
        this.renderMenu = this.renderMenu.bind(this)
        this.renderTab = this.renderTab.bind(this)
        this.renderLabel = this.renderLabel.bind(this)
        this.renderTabTooltip = this.renderTabTooltip.bind(this)
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
                    selectedLabel={this.renderLabel}
                    tabTooltip={this.renderTabTooltip}
                    tabActions={this.renderMenu}
                    onTitleChanged={saveRecipe}
                    onClose={this.onCloseTab}>
                    {this.renderTab}
                </Tabs>
                <CloseRecipe/>
                <SaveRecipe/>
                <MoveRecipe/>
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

    renderLabel({type}) {
        return type
            ? getRecipeType(type)?.labels.name
            : msg('process.recipeList.title')
    }

    renderTabTooltip({id, type, title, placeholder}) {
        return type
            ? <RecipeTabTooltip recipeId={id} name={title || placeholder}/>
            : undefined
    }

    renderMenu(recipeId) {
        return (
            <Recipe id={recipeId}>
                <ProcessMenu recipeId={recipeId}/>
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

    // The dialog is about the recipe closed: what holds it back is that recipe's open panels, not another's.
    onCloseTab(tab, close) {
        const {activationContext: {pathList}} = this.props
        const recipe = {
            ...select(recipePath(tab.id)),
            title: tab.title
        }
        const unsaved = recipe.ui && recipe.ui.unsaved && recipe.ui.initialized
        if (unsaved) {
            activateIn(recipeActivationPath(pathList, tab.id), 'closeRecipeDialog', {recipe})
        } else {
            close()
        }
    }

    componentDidMount() {
        const {folders, recipes, stream} = this.props
        if (!folders) {
            stream('LOAD_FOLDERS',
                loadFolders$(),
                null,
                () => Notifications.error({message: msg('process.folder.loadingError'), timeout: -1})
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

const ProcessContent = compose(
    _Process,
    withActivationContext(),
    withLeaveAlert(hasUnsavedWork)
)

// Process owns the source runtime. Wrapping here rather than in Body keeps source resolution out of what Body
// knows about, and gives the runtime exactly the lifetime its operations need: it mounts when Process is first
// activated, survives route navigation because Section retains Process, and closes when Process does.
export const Process = props => (
    <SourceRuntimeProvider>
        <ProcessContent {...props}/>
    </SourceRuntimeProvider>
)
