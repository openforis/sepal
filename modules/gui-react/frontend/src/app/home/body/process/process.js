import React from 'react'
import Tabs from 'widget/tabs'
import Classification from './classification/classification'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'
import ProcessMenu from './processMenu'
import {saveRecipe} from './recipe'

const Process = () => {
    const contents = ({id, type}) => {
        switch (type) {
            case 'MOSAIC':
                return <Mosaic recipeId={id}/>
            case 'CLASSIFICATION':
                return <Classification recipeId={id}/>
            default:
                return <CreateOrLoadRecipe recipeId={id}/>
        }
    }

    return (
        <Tabs
            statePath='process'
            tabActions={(recipeId) => <ProcessMenu recipeId={recipeId}/>}
            onTitleChanged={recipe => saveRecipe(recipe)}>
            {contents}
        </Tabs>
    )
}
export default Process