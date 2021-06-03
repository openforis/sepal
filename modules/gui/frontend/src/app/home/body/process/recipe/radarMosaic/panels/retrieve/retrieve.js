import {RecipeActions} from '../../radarMosaicRecipe'
import {compose} from 'compose'
import {groupedBandOptions} from 'sources'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../../../recipeContext'
import React from 'react'
import RetrievePanel from '../../../mosaic/panels/retrieve/retrieve'

const mapRecipeToProps = recipe => {
    return ({
        recipeId: recipe.id,
        timeScan: !selectFrom(recipe, 'model.dates.targetDate')
    })
}

const option = band => ({value: band, label: band})

class Retrieve extends React.Component {
    metadataOptions = {options: [
        option('unixTimeDays'),
        option('dayOfYear'),
        option('daysFromTarget')
    ]}

    render() {
        return (
            <RetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={20}
                toSepal
                toEE
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
    }

    bandOptions() {
        const {timeScan} = this.props
        const options = groupedBandOptions({
            dataSetId: 'SENTINEL_1',
            timeScan,
            order: ['dataSets']
        })
        return timeScan
            ? options
            : [...options, this.metadataOptions]
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

Retrieve.propTypes = {}

export default compose(
    Retrieve,
    withRecipe(mapRecipeToProps)
)
