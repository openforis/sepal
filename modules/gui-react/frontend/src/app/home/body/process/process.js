import React from 'react'
import Tabs from 'widget/tabs'
import CreateOrLoadRecipe from './createOrLoadRecipe'
import Mosaic from './mosaic/mosaic'

const Process = () => {
    const contents = ({id, type}) => {
        switch (type) {
            case 'mosaic':
                return <Mosaic id={id}/>
            case 'classification':
                return <Classification id={id}/>
            default:
                return <CreateOrLoadRecipe id={id}/>
        }
    }

    return (
        <Tabs statePath='process'>
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