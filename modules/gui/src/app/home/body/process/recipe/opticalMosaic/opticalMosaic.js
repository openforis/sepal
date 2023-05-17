import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions, dateRange, defaultModel} from './opticalMosaicRecipe'
import {SceneAreas} from './sceneAreas'
import {compose} from 'compose'
import {getAvailableBands} from './bands'
import {getPreSetVisualizations} from './visualizations'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import AutoSelectScenes from './autoSelectScenes'
import MosaicToolbar from './panels/opticalMosaicToolbar'
import React from 'react'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    savedLayers: selectFrom(recipe, 'layers')
})

class _OpticalMosaic extends React.Component {
    constructor(props) {
        super(props)
        const {savedLayers, recipeId} = props
        const recipeActions = RecipeActions(recipeId)
        recipeActions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()
        initializeLayers({recipeId, savedLayers})
    }

    render() {
        const {initialized, aoi} = this.props
        return (
            <Map>
                <MosaicToolbar/>
                <Aoi value={aoi}/>
                {initialized
                    ? <React.Fragment>
                        <SceneAreas/>
                        <AutoSelectScenes/>
                        <SceneSelection/>
                        <SceneDeselection/>
                    </React.Fragment>
                    : null}
            </Map>
        )
    }
}

const OpticalMosaic = compose(
    _OpticalMosaic,
    recipe({defaultModel, mapRecipeToProps})
)

export default () => ({
    id: 'MOSAIC',
    labels: {
        name: msg('process.mosaic.create'),
        creationDescription: msg('process.mosaic.description'),
        tabPlaceholder: msg('process.mosaic.tabPlaceholder'),
    },
    tags: ['MOSAIC'],
    components: {
        recipe: OpticalMosaic
    },
    getDependentRecipeIds: _recipe => [],
    getDateRange: recipe => dateRange(recipe.model.dates),
    getAvailableBands,
    getPreSetVisualizations
})
