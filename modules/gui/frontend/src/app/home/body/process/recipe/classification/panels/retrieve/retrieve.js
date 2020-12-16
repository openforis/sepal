import {RecipeActions} from '../../classificationRecipe'
import {compose} from 'compose'
import {groupedBandOptions} from 'sources'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../../../recipeContext'
import React from 'react'
import RetrievePanel from '../../../mosaic/panels/retrieve/retrieve'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    classificationLegend: selectFrom(recipe, 'model.legend') || {},
    classifierType: selectFrom(recipe, 'model.classifier.type')
})

class Retrieve extends React.Component {
    render() {
        return (
            <RetrievePanel
                bandOptions={this.bandOptions()}
                defaultScale={30}
                toSepal
                toEE
                onRetrieve={retrieveOptions => this.retrieve(retrieveOptions)}
            />
        )
    }

    bandOptions() {
        const {classificationLegend, classifierType} = this.props
        return groupedBandOptions({
            classification: {classifierType, classificationLegend},
            order: ['classification']
        })
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
