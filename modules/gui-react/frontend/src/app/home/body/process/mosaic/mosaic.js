import {SceneSelectionType} from 'app/home/body/process/mosaic/mosaicRecipe'
import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import AutoSelectScenes from './autoSelectScenes'
import BandSelection from './bandSelection'
import MapToolbar from './mapToolbar'
import styles from './mosaic.module.css'
import MosaicPreview from './mosaicPreview'
import {RecipeState} from './mosaicRecipe'
import MosaicToolbar from './panels/mosaicToolbar'
import Panels from './panels/panels'
import SceneAreas from './sceneAreas'
import SceneDeselection from './sceneDeselection'
import SceneSelection from './sceneSelection'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        aoi: recipe('aoi'),
        source: Object.keys(recipe('sources'))[0],
        sceneSelectionOptions: recipe('sceneSelectionOptions'),
        sceneSelection: recipe('ui.sceneSelection'),
    }
}

class Mosaic extends React.Component {
    render() {
        const {recipeId, aoi, source, sceneSelectionOptions: {type}, sceneSelection} = this.props
        return (
            <div className={styles.mosaic}>
                <MapToolbar recipeId={recipeId} className={styles.mapToolbar}/>
                <MosaicToolbar recipeId={recipeId} className={styles.mosaicToolbar}/>
                <Panels recipeId={recipeId} className={styles.panel}/>
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
        setAoiLayer({contextId: recipeId, aoi, destroy$: componentWillUnmount$})
    }
}

Mosaic.propTypes = {
    recipeId: PropTypes.string.isRequired,
    aoi: PropTypes.object
}

export default connect(mapStateToProps)(Mosaic)
