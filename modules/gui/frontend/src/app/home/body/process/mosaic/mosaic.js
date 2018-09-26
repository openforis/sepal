import {RecipeState, recipePath} from './mosaicRecipe'
import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {connect, select} from 'store'
import {sepalMap} from 'app/home/map/map'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import AutoSelectScenes from './autoSelectScenes'
import BandSelection from './bandSelection'
import MapToolbar from 'app/home/map/mapToolbar'
import MosaicPreview from './mosaicPreview'
import MosaicToolbar from './panels/mosaicToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import SceneAreas from './sceneAreas'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'
import ShowSceneAreaToggle from 'app/home/body/process/mosaic/showSceneAreaToggle'
import styles from './mosaic.module.css'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        initialized: recipeState('ui.initialized'),
        aoi: recipeState('model.aoi'),
        source: recipeState.source(),
        sceneSelectionOptions: recipeState('model.sceneSelectionOptions'),
        sceneSelection: recipeState('ui.sceneSelection'),
        tabCount: select('process.tabs').length
    }
}

class Mosaic extends React.Component {
    render() {
        const {recipeId, initialized, aoi, source, sceneSelectionOptions: {type}, sceneSelection} = this.props
        return (
            <div className={styles.mosaic}>
                <MapToolbar statePath={recipePath(recipeId, 'ui')} mapContext={recipeId} labelLayerIndex={1}>
                    <ShowSceneAreaToggle recipeId={recipeId}/>
                </MapToolbar>
                <MosaicToolbar recipeId={recipeId} className={styles.mosaicToolbar}/>

                {initialized
                    ? <React.Fragment>
                        <MosaicPreview recipeId={recipeId}/>
                        {aoi && source && type === SceneSelectionType.SELECT
                            ? <React.Fragment>
                                <SceneAreas recipeId={recipeId}/>
                                <AutoSelectScenes recipeId={recipeId}/>
                            </React.Fragment>
                            : null}
                        {sceneSelection
                            ? <SceneSelection recipeId={recipeId} sceneAreaId={sceneSelection}/>
                            : null}
                        <SceneDeselection recipeId={recipeId}/>
                        <BandSelection recipeId={recipeId}/>
                    </React.Fragment>
                    : null}
            </div>
        )
    }

    componentDidMount() {
        const {recipeId, aoi, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi,
            destroy$: componentWillUnmount$,
            onInitialized: () => {
                if (this.props.tabCount === 1)
                    sepalMap.setContext(recipeId)
                sepalMap.getContext(recipeId).fitLayer('aoi')
            }
        })
    }
}

Mosaic.propTypes = {
    recipeId: PropTypes.string.isRequired,
    aoi: PropTypes.object
}

export default connect(mapStateToProps)(Mosaic)
