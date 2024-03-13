import {MosaicRetrievePanel} from '~/app/home/body/process/recipe/mosaic/panels/retrieve/retrievePanel'
import {RecipeActions} from '~/app/home/body/process/recipe/changeAlerts/changeAlertsRecipe'
import {compose} from '~/compose'
import {getGroupedBandOptions} from '~/app/home/body/process/recipe/changeAlerts/bands'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import React from 'react'

const mapRecipeToProps = recipe => ({recipe})

class _Retrieve extends React.Component {
    render() {
        return (
            <MosaicRetrievePanel
                bandOptions={getGroupedBandOptions()}
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
