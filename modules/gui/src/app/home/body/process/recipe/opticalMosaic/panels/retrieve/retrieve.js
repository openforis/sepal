import React from 'react'

import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {getGroupedBandOptions} from '~/app/home/body/process/recipe/opticalMosaic/bands'
import {RecipeActions} from '~/app/home/body/process/recipe/opticalMosaic/opticalMosaicRecipe'
import {minScale} from '~/app/home/body/process/recipe/opticalMosaic/sources'
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
                bandOptions={this.bandOptions()}
                defaultScale={minScale(recipe)}
                toSepal
                toEE
                onRetrieve={retrieveOptions => {
                    return this.retrieve(retrieveOptions)
                }}
            />
        )
    }

    bandOptions() {
        const {recipe} = this.props
        return getGroupedBandOptions(recipe)
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

export const Retrieve = compose(
    _Retrieve,
    withRecipe(mapRecipeToProps)
)
    
Retrieve.propTypes = {}
