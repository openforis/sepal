import React from 'react'

import {groupedBandPresentation} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {retrieveTask} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {minScale} from '~/app/home/body/process/recipe/opticalMosaic/sources'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

const mapRecipeToProps = recipe => ({
    recipe
})

class _Retrieve extends React.Component {
    render() {
        const {recipe} = this.props
        return (
            <MosaicRetrievePanel
                bandOptions={groupedBandPresentation()}
                defaultScale={minScale(recipe)}
                toSepal
                toEE
                toDrive
                task={retrieveTask}
            />
        )
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)
    
Retrieve.propTypes = {}
