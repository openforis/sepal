import React from 'react'
import Tabs from 'widget/tabs'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'
import Menu from './menu'

const Process = () => {
    const tabActions = (id) => {
        return <Menu recipeId={id}/>
    }

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
        <Tabs statePath='process' tabActions={tabActions}>
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