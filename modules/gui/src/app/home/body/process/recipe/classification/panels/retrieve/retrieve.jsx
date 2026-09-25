import React from 'react'

import {groupedBandPresentation} from '~/app/home/body/process/recipe/classification/bands'
import {retrieveTask} from '~/app/home/body/process/recipe/classification/classificationRecipe'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

const mapRecipeToProps = recipe => ({recipe})

class _Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={30}
                toSepal
                toEE
                toDrive
                task={retrieveTask}
            />
        )
    }

    bandOptions() {
        const {recipe} = this.props
        return groupedBandPresentation(recipe)
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)

Retrieve.propTypes = {}
