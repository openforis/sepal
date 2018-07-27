import Revisions from 'app/home/body/process/revisions'
import LandCover from 'landCover/landCover'
import React from 'react'
import Tabs from 'widget/tabs'
import Classification from './classification/classification'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'
import ProcessMenu from './processMenu'
import {saveRecipe} from './recipe'

const recipeComponent = (id, type) => {
    switch (type) {
        case 'MOSAIC':
            return <Mosaic recipeId={id}/>
        case 'CLASSIFICATION':
            return <Classification recipeId={id}/>
        case 'LAND_COVER':
            return <LandCover recipeId={id}/>
        default:
            return <CreateOrLoadRecipe recipeId={id}/>
    }
}


const Process = () => {
    return (
        <Tabs
            statePath='process'
            tabActions={(recipeId) => <ProcessMenu recipeId={recipeId}/>}
            onTitleChanged={recipe => saveRecipe(recipe)}>
            {({id, type}) =>
                <React.Fragment>
                    {recipeComponent(id, type)}
                    <Revisions recipeId={id}/>
                </React.Fragment>
            }
        </Tabs>
    )
}
export default Process