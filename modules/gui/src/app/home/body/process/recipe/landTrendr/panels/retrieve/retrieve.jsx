import React from 'react'

import {groupedBandPresentation} from '~/app/home/body/process/recipe/landTrendr/bands'
import {retrieveTask} from '~/app/home/body/process/recipe/landTrendr/landTrendrRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

const mapRecipeToProps = recipe => ({recipeId: recipe.id})

class _Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                bandOptions={groupedBandPresentation()}
                defaultScale={30}
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
