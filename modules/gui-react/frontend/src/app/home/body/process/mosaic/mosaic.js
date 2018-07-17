import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import ShowSceneAreaToggle from 'app/home/body/process/mosaic/showSceneAreaToggle'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import {sepalMap} from 'app/home/map/map'
import MapToolbar from 'app/home/map/mapToolbar'
import PropTypes from 'prop-types'
import React from 'react'
import {connect, select} from 'store'
import AutoSelectScenes from './autoSelectScenes'
import BandSelection from './bandSelection'
import styles from './mosaic.module.css'
import MosaicPreview from './mosaicPreview'
import {recipePath, RecipeState} from './mosaicRecipe'
import MosaicToolbar from './panels/mosaicToolbar'
import SceneAreas from './sceneAreas'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'

const mapStateToProps = (state, ownProps) => {
    const recipeState = RecipeState(ownProps.recipeId)
    return {
        aoi: recipeState('model.aoi'),
        source: Object.keys(recipeState('model.sources'))[0],
        sceneSelectionOptions: recipeState('model.sceneSelectionOptions'),
        sceneSelection: recipeState('ui.sceneSelection'),
        tabCount: select('process.tabs').length
    }
}

class Mosaic extends React.Component {
    render() {
        const {recipeId, aoi, source, sceneSelectionOptions: {type}, sceneSelection} = this.props
        return (
            <div className={styles.mosaic}>
                <MapToolbar statePath={recipePath(recipeId, 'ui')} mapContext={recipeId} labelLayerIndex={1}>
                    <ShowSceneAreaToggle recipeId={recipeId}/>
                </MapToolbar>
                <MosaicToolbar recipeId={recipeId} className={styles.mosaicToolbar}/>
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
