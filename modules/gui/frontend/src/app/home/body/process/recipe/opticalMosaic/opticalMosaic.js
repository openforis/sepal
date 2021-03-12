import {Content, SectionLayout} from 'widget/sectionLayout'
import {RecipeActions, defaultModel} from './opticalMosaicRecipe'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipe} from 'app/home/body/process/recipeContext'
import {selectFrom} from 'stateUtils'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import AutoSelectScenes from './autoSelectScenes'
import BandSelection from './bandSelection'
import MapScale from 'app/home/map/mapScale'
import MapToolbar from 'app/home/map/mapToolbar'
import MosaicToolbar from './panels/opticalMosaicToolbar'
import OpticalMosaicPreview from './opticalMosaicPreview'
import React from 'react'
import SceneAreas from './sceneAreas'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'
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
        recipeActions.setBands('red, green, blue').dispatch()
        recipeActions.setAutoSelectSceneCount({min: 1, max: 99}).dispatch()
    }

    render() {
        const {recipeContext: {statePath}, initialized} = this.props
        return (
            <SectionLayout>
                <Content>
                    <div className={styles.mosaic}>
                        <MapToolbar statePath={[statePath, 'ui']} labelLayerIndex={3}/>
                        <MapScale/>
                        <MosaicToolbar/>
                        {initialized
                            ? <React.Fragment>
                                <OpticalMosaicPreview/>
                                <SceneAreas/>
                                <AutoSelectScenes/>
                                <SceneSelection/>
                                <SceneDeselection/>
                                <BandSelection/>
                            </React.Fragment>
                            : null}
                    </div>
                </Content>
            </SectionLayout>
        )
    }

    componentDidMount() {
        const {mapContext, aoi} = this.props
        setAoiLayer({
            mapContext,
            aoi,
            // destroy$: componentWillUnmount$, [TODO] check
            onInitialized: () => mapContext.sepalMap.fitLayer('aoi')
        })
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
