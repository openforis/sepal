import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {UnsupervisedClassificationToolbar} from './panels/unsupervisedClassificationToolbar'
import {getDefaultModel, RecipeActions} from './unsupervisedClassificationRecipe'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    savedLayers: selectFrom(recipe, 'layers'),
})

class _UnsupervisedClassification extends React.Component {

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
                <UnsupervisedClassificationToolbar/>
                <Aoi value={images && images.length && images[0]}/>
            </Map>
        )
    }

}

const UnsupervisedClassification = compose(
    _UnsupervisedClassification,
    recipe({getDefaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe =>
    (selectFrom(recipe, 'model.inputImagery.images') || [])
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'UNSUPERVISED_CLASSIFICATION',
    labels: {
        name: msg('process.unsupervisedClassification.create'),
        creationDescription: msg('process.unsupervisedClassification.description'),
        tabPlaceholder: msg('process.unsupervisedClassification.tabPlaceholder'),
    },
    components: {
        recipe: UnsupervisedClassification
    },
    getDependentRecipeIds,
    getDateRange(_recipe) {
        return null
    },
    getAvailableBands,
    getPreSetVisualizations
})
