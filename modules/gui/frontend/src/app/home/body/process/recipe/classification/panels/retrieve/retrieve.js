import {RecipeActions} from 'app/home/body/process/recipe/classification/classificationRecipe'
import {compose} from 'compose'
import {getGroupedBandOptions} from 'app/home/body/process/recipe/classification/bands'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import RetrievePanel from 'app/home/body/process/recipe/mosaic/panels/retrieve/retrieve'

const mapRecipeToProps = recipe => ({recipe})

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
        const {recipe} = this.props
        return getGroupedBandOptions(recipe)
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
