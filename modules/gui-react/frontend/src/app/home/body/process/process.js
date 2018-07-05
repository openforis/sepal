import React from 'react'
import Tabs from 'widget/tabs'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'
import ProcessMenu from './processMenu'

const Process = () => {
    const contents = ({id, type}) => {
        switch (type) {
            case 'mosaic':
                return <Mosaic recipeId={id}/>
            case 'classification':
                return <Classification recipeId={id}/>
            default:
                return <CreateOrLoadRecipe recipeId={id}/>
        }
    }

    return (
        <Tabs statePath='process' tabActions={(recipeId) => <ProcessMenu recipeId={recipeId}/>}>
            {contents}
        </Tabs>
    )
}
export default Process

const Classification = () =>
    <div>
        <h2>Classification</h2>
        <input placeholder='Some input'/>
    </div>