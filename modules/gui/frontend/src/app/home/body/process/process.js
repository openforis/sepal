import {RecipeContext} from 'app/home/body/process/recipeContext'
import {activator} from 'widget/activation/activator'
import {msg} from 'translate'
import {saveRecipe} from './recipe'
import Classification from './classification/classification'
import CloseRecipe from './closeRecipe'
import LandCover from './landCover/landCover'
import Mosaic from './mosaic/mosaic'
import ProcessMenu from './processMenu'
import RadarMosaic from './radarMosaic/radarMosaic'
import React from 'react'
import Recipes from './recipes'
import Revisions from 'app/home/body/process/revisions'
import SaveRecipe from './saveRecipe'
import Tabs from 'widget/tabs'
import TimeSeries from './timeSeries/timeSeries'

const recipeByType = id => ({
    MOSAIC: <Mosaic/>,
    RADAR_MOSAIC: <RadarMosaic/>,
    CLASSIFICATION: <Classification recipeId={id}/>,
    TIME_SERIES: <TimeSeries recipeId={id}/>,
    LAND_COVER: <LandCover/>
})

class Process extends React.Component {
    renderRecipeList(id) {
        return <Recipes recipeId={id}/>
    }

    renderRecipeByType(id, type) {
        return recipeByType(id)[type]
    }

    renderRecipe(id, type) {
        return type
            ? this.renderRecipeByType(id, type)
            : this.renderRecipeList(id)

    }

    renderMenu(recipeId) {
        return (
            <RecipeContext recipeId={recipeId} rootStatePath='process.tabs'>
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
                        <RecipeContext recipeId={id} rootStatePath='process.tabs'>
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

export default (
    activator('closeRecipeDialog')(
        Process
    )
)
