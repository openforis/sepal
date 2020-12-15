import {RecipeActions} from '../../timeSeriesRecipe'
import {compose} from 'compose'
import {groupedBandOptions} from 'sources'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../../../recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import RetrievePanel from '../../../mosaic/panels/retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    sources: selectFrom(recipe, 'model.sources'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
    classifierType: selectFrom(recipe, 'ui.classification.classifierType'),
    corrections: selectFrom(recipe, 'model.opticalPreprocess.corrections')
})

class Retrieve extends React.Component {
    render() {
        return (
            <RetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={30}
                single
                toEE
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
    }

    bandOptions() {
        const {classificationLegend, classifierType, corrections, sources: {dataSets: sources}} = this.props
        return groupedBandOptions({
            sources,
            corrections,
            timeScan: false,
            classification: {classifierType, classificationLegend, include: ['regression', 'probabilities']},
            order: ['indexes', 'dataSets', 'classification']
        })
    }

    retrieve(retrieveOptions) {
        const {recipeId} = this.props
        return RecipeActions(recipeId).retrieve(retrieveOptions)
    }
}

Retrieve.propTypes = {
    recipeId: PropTypes.string
}

export default compose(
    Retrieve,
    withRecipe(mapRecipeToProps)
)
