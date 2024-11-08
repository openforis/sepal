import React from 'react'

import {RecipeActions} from '~/app/home/body/process/recipe/bandMath/bandMathRecipe'
import {getGroupedBandOptions} from '~/app/home/body/process/recipe/bandMath/bands'
import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'

const mapRecipeToProps = recipe => ({recipe})

class _Retrieve extends React.Component {
    render() {
        const {recipe} = this.props
        return (
            <MosaicRetrievePanel
                bandOptions={getGroupedBandOptions(recipe)}
                defaultScale={30}
                toSepal
                toEE
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
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
