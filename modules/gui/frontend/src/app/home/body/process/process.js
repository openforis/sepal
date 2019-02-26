import {RecipeContext} from 'app/home/body/process/recipeContext'
import {saveRecipe} from './recipe'
import ChangeDetection from './changeDetection/changeDetection'
import Classification from './classification/classification'
import LandCover from './landCover/landCover'
import Mosaic from './mosaic/mosaic'
import ProcessMenu from './processMenu'
import React from 'react'
import Recipes from './recipes'
import Revisions from 'app/home/body/process/revisions'
import Tabs from 'widget/tabs'
import TimeSeries from './timeSeries/timeSeries'

const recipeByType = id => ({
    MOSAIC: <Mosaic/>,
    CLASSIFICATION: <Classification recipeId={id}/>,
    CHANGE_DETECTION: <ChangeDetection recipeId={id}/>,
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

    render() {
        return (
            <Tabs
                statePath='process'
                tabActions={recipeId => this.renderMenu(recipeId)}
                onTitleChanged={recipe => saveRecipe(recipe)}>
                {({id, type}) =>
                    <React.Fragment>
                        <RecipeContext recipeId={id} rootStatePath='process.tabs'>
                            {this.renderRecipe(id, type)}
                        </RecipeContext>
                    </React.Fragment>
                }
            </Tabs>
        )
    }
}

export default Process
