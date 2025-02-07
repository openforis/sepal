import PropTypes from 'prop-types'
import React from 'react'

import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

import {RecipeActions} from '../../samplingDesignRecipe'

const mapRecipeToProps = recipe =>
    ({
        recipeId: recipe.id,
    })

class _Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={30}
                defaultTileSize={2}
                defaultShardSize={256}
                defaultFileDimensionsMultiple={2}
                single
                toSepal
                allowTiling
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
    }

    bandOptions() {
        // const {classificationLegend, classifierType, corrections, sources: {dataSets}} = this.props
        // return groupedBandOptions({
        //     dataSets: toDataSetIds(dataSets),
        //     corrections,
        //     classification: {classifierType, classificationLegend, include: ['regression', 'probabilities']}
        // })
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

Retrieve.propTypes = {
    recipeId: PropTypes.string
}
