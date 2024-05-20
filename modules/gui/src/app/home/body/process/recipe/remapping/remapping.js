import React from 'react'

import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {initializeLayers} from '../recipeImageLayerSource'
import {getAvailableBands} from './bands'
import {RemappingToolbar} from './panels/remappingToolbar'
import {getDefaultModel} from './remappingRecipe'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    images: selectFrom(recipe, 'model.inputImagery.images'),
    savedLayers: selectFrom(recipe, 'layers'),
})

class _Remapping extends React.Component {

    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {images} = this.props
        return (
            <Map>
                <RemappingToolbar/>
                <Aoi value={images && images.length && images[0]}/>
            </Map>
        )
    }
}

const Remapping = compose(
    _Remapping,
    recipe({getDefaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe =>
    (selectFrom(recipe, 'model.inputImagery.images') || [])
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'REMAPPING',
    labels: {
        name: msg('process.remapping.create'),
        creationDescription: msg('process.remapping.description'),
        tabPlaceholder: msg('process.remapping.tabPlaceholder'),
    },
    components: {
        recipe: Remapping
    },
    getDependentRecipeIds,
    getDateRange(_recipe) {
        return null
    },
    getAvailableBands,
    getPreSetVisualizations
})
