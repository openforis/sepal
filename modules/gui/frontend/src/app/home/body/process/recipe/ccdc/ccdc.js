import {Aoi} from '../aoi'
import {Map} from '../../../../map/map'
import {RecipeActions, defaultModel} from './ccdcRecipe'
import {SceneAreas} from '../opticalMosaic/sceneAreas'
import {compose} from 'compose'
import {initializeLayers} from '../recipeImageLayerSource'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {recipeAccess} from '../../recipeAccess'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import AutoSelectScenes from '../opticalMosaic/autoSelectScenes'
import CCDCToolbar from './panels/ccdcToolbar'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import MosaicToolbar from '../opticalMosaic/panels/opticalMosaicToolbar'
import Notifications from 'widget/notifications'
import React from 'react'
import SceneDeselection from '../opticalMosaic/sceneDeselection'
import SceneSelection from '../opticalMosaic/sceneSelection'
import styles from './ccdc.module.css'

const mapRecipeToProps = recipe => ({
    initialized: selectFrom(recipe, 'ui.initialized'),
    aoi: selectFrom(recipe, 'model.aoi'),
    layers: selectFrom(recipe, 'layers'),
    classificationRecipeId: selectFrom(recipe, 'model.sources.classification'),
    classificationLegend: selectFrom(recipe, 'ui.classification.classificationLegend'),
})

class _CCDC extends React.Component {
    constructor(props) {
        super(props)
        const {layers, recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        initializeLayers(recipeId, layers)
    }

    render() {
        const {aoi} = this.props
        return (
            <Map>
                <CCDCToolbar/>
                <Aoi value={aoi}/>
            </Map>
        )
    }

    componentDidMount() {
        const {componentWillUnmount$} = this.props
        // this.initClassification()
    }

    // componentDidUpdate() {
    //     this.initClassification()
    // }

    // initClassification() {
    //     const {stream, classificationLegend, classificationRecipeId, loadRecipe$} = this.props
    //     if (classificationRecipeId && !classificationLegend && !stream('LOAD_CLASSIFICATION_RECIPE').active) {
    //         stream('LOAD_CLASSIFICATION_RECIPE',
    //             loadRecipe$(classificationRecipeId),
    //             classification => {
    //                 this.recipeActions.setClassification({
    //                     classificationLegend: classification.model.legend,
    //                     classifierType: classification.model.classifier.type
    //                 })
    //             },
    //             error => Notifications.error({message: msg('process.ccdc.panel.sources.classificationLoadError', {error}), error})
    //         )
    //     } else if (!classificationRecipeId && classificationLegend && !stream('LOAD_CLASSIFICATION_RECIPE').active) {
    //         this.recipeActions.setClassification({classificationLegend: null, classifierType: null})
    //     }
    // }
}

const CCDC = compose(
    _CCDC,
    recipe({defaultModel, mapRecipeToProps}),
    recipeAccess()
)

export default () => ({
    id: 'CCDC',
    labels: {
        name: msg('process.ccdc.create'),
        creationDescription: msg('process.ccdc.description'),
        tabPlaceholder: msg('process.ccdc.tabPlaceholder')
    },
    components: {
        recipe: CCDC
    }
})
