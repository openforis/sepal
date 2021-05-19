import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions, defaultModel} from './opticalMosaicRecipe'
import {SceneAreas} from './sceneAreas'
import {compose} from 'compose'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import AutoSelectScenes from './autoSelectScenes'
import MosaicToolbar from './panels/opticalMosaicToolbar'
import React from 'react'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'
import styles from './opticalMosaic.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    layers: selectFrom(recipe, 'layers')
})

class _OpticalMosaic extends React.Component {
    constructor(props) {
        super(props)
        const {layers, recipeId} = props
        const recipeActions = RecipeActions(recipeId)
        recipeActions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()
        initializeLayers(recipeId, layers)
    }

    render() {
        const {initialized, aoi} = this.props
        return (
            <Map className={styles.mosaic}>
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
    components: {
        recipe: OpticalMosaic
    }
})
