import React from 'react'

import {initializeLayers} from '~/app/home/body/process/recipe/recipeImageLayerSource'
import {recipe} from '~/app/home/body/process/recipeContext'
import {Map} from '~/app/home/map/map'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'

import {Aoi} from '../aoi'
import {getAvailableBands} from './bands'
import {defaultModel} from './maskingRecipe'
import {MaskingToolbar} from './panels/maskingToolbar'
import {getPreSetVisualizations} from './visualizations'

const mapRecipeToProps = recipe => ({
    imageToMask: selectFrom(recipe, 'model.imageToMask'),
    imageMask: selectFrom(recipe, 'model.imageMask'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _Masking extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {imageToMask} = this.props
        return (
            <Map>
                <MaskingToolbar/>
                <Aoi value={imageToMask}/>
            </Map>
        )
    }
}

const Masking = compose(
    _Masking,
    recipe({defaultModel, mapRecipeToProps})
)

const getDependentRecipeIds = recipe =>
    [
        (selectFrom(recipe, 'model.imageToMask') || {}),
        (selectFrom(recipe, 'model.imageMask') || {}),
    ]
        .filter(({type}) => type === 'RECIPE_REF')
        .map(({id}) => id)

export default () => ({
    id: 'MASKING',
    labels: {
        name: msg('process.masking.create'),
        creationDescription: msg('process.masking.description'),
        tabPlaceholder: msg('process.masking.tabPlaceholder'),
    },
    components: {
        recipe: Masking
    },
    sourceRecipe: recipe => recipe.model.imageToMask,
    getDependentRecipeIds,
    getAvailableBands,
    getPreSetVisualizations
})
