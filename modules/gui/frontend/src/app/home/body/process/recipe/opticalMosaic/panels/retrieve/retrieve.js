import {RecipeActions} from '../../opticalMosaicRecipe'
import {compose} from 'compose'
import {groupedBandOptions, minScale} from 'sources'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../../../recipeContext'
import React from 'react'
import RetrievePanel from '../../../mosaic/panels/retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    sources: selectFrom(recipe, 'model.sources'),
    compositeOptions: selectFrom(recipe, 'model.compositeOptions')
})

const option = band => ({value: band, label: band})

class Retrieve extends React.Component {
    metadataOptions = {
        options: [
            option('unixTimeDays'),
            option('dayOfYear'),
            option('daysFromTarget')
        ]
    }

    render() {
        const {sources} = this.props
        return (
            <RetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={minScale(sources)}
                toSepal
                toEE
                onRetrieve={retrieveOptions => {
                    return this.retrieve(retrieveOptions)
                }}
            />
        )
    }

    bandOptions() {
        const {sources, compositeOptions: {compose, corrections}} = this.props
        const options = groupedBandOptions({
            sources,
            corrections,
            order: ['dataSets', 'indexes']
        })
        return compose === 'MEDIAN'
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
