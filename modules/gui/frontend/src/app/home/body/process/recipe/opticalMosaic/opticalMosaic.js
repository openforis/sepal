import {Aoi} from '../aoi'
import {Map} from 'app/home/map/map'
import {RecipeActions, defaultModel} from './opticalMosaicRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import AutoSelectScenes from './autoSelectScenes'
import MosaicToolbar from './panels/opticalMosaicToolbar'
import React from 'react'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'
import _ from 'lodash'
import styles from './opticalMosaic.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi')
})

class _OpticalMosaic extends React.Component {
    constructor(props) {
        super(props)
        const {recipeId} = props
        const recipeActions = RecipeActions(recipeId)
        recipeActions.setSceneAreasShown(true).dispatch()
        recipeActions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()
        recipeActions.initializeLayers()
    }

    render() {
        const {initialized, aoi} = this.props
        return (
            <Map className={styles.mosaic}>
                <MosaicToolbar/>
                <Aoi value={aoi}/>
                {initialized
                    ? <React.Fragment>
                        {/*<SceneAreas/>*/}
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
