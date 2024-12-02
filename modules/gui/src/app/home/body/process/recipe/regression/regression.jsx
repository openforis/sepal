import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {RegressionToolbar} from './panels/regressionToolbar'
import {getDefaultModel, RecipeActions} from './regressionRecipe'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    savedLayers: selectFrom(recipe, 'layers'),
    trainingDataSets: selectFrom(recipe, 'model.trainingData.dataSets')
})

class _Regression extends React.Component {

    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        initializeLayers({
            recipeId,
            savedLayers
        })
    }

    render() {
        const {images} = this.props
        return (
            <Map>
                <RegressionToolbar/>
                <Aoi value={images && images.length && images[0]}/>
            </Map>
        )
    }
}

const Regression = compose(
    _Regression,
    recipe({getDefaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe =>
    (selectFrom(recipe, 'model.inputImagery.images') || [])
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'REGRESSION',
    labels: {
        name: msg('process.regression.create'),
        creationDescription: msg('process.regression.description'),
        tabPlaceholder: msg('process.regression.tabPlaceholder'),
    },
    components: {
        recipe: Regression
    },
    getDependentRecipeIds,
    getDateRange(_recipe) {
        return null
    },
    getAvailableBands,
    getPreSetVisualizations
})
