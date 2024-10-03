import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {StackToolbar} from './panels/stackToolbar'
import {getDefaultModel, RecipeActions} from './stackRecipe'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    images: selectFrom(recipe, 'model.inputImagery.images'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _Stack extends React.Component {

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
                <StackToolbar/>
                <Aoi value={images && images.length && images[0]}/>
            </Map>
        )
    }
}

const Stack = compose(
    _Stack,
    recipe({getDefaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe =>
    (selectFrom(recipe, 'model.inputImagery.images') || [])
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'STACK',
    labels: {
        name: msg('process.stack.create'),
        creationDescription: msg('process.stack.description'),
        tabPlaceholder: msg('process.stack.tabPlaceholder'),
    },
    components: {
        recipe: Stack
    },
    getDependentRecipeIds,
    getDateRange(_recipe) {
        return null
    },
    getAvailableBands,
    getPreSetVisualizations
})
