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

const recipeComponent = (id, type) => (
    {
        MOSAIC: <Mosaic/>,
        CLASSIFICATION: <Classification recipeId={id}/>,
        CHANGE_DETECTION: <ChangeDetection recipeId={id}/>,
        TIME_SERIES: <TimeSeries recipeId={id}/>,
        LAND_COVER: <LandCover/>
    }[type] || <Recipes recipeId={id}/>)

const Process = () => {
    return (
        <Tabs
            statePath='process'
            tabActions={recipeId => <ProcessMenu recipeId={recipeId}/>}
            onTitleChanged={recipe => saveRecipe(recipe)}>
            {({id, type}) =>
                <React.Fragment>
                    <RecipeContext recipeId={id} rootStatePath='process.tabs'>
                        {recipeComponent(id, type)}
                    </RecipeContext>
                    <Revisions recipeId={id}/>
                </React.Fragment>
            }
        </Tabs>
    )
}
export default Process
