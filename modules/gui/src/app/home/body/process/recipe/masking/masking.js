import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {compose} from 'compose'
import {defaultModel} from './maskingRecipe'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from 'app/home/body/process/recipe/recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import MaskingToolbar from './panels/maskingToolbar'
import React from 'react'

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
