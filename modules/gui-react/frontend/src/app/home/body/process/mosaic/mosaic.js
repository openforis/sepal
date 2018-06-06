import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import MapToolbar from './mapToolbar'
import styles from './mosaic.module.css'
import MosaicPreview from './mosaicPreview'
import {RecipeState} from './mosaicRecipe'
import Panels from './panels/panels'
import MosaicToolbar from './panels/mosaicToolbar'
import SceneAreas from './sceneAreas'

const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        aoi: recipe('aoi')
    }
}

class Mosaic extends React.Component {
    render() {
        const {recipeId} = this.props
        return (
            <div className={styles.mosaic}>
                <MapToolbar recipeId={recipeId} className={styles.mapToolbar}/>
                <MosaicToolbar recipeId={recipeId} className={styles.mosaicToolbar}/>
                <Panels recipeId={recipeId} className={styles.panel}/>
                <MosaicPreview recipeId={recipeId}/>
                <SceneAreas recipeId={recipeId}/>
            </div>
        )
    }

    componentDidMount() {
        const {recipeId, aoi, componentWillUnmount$} = this.props
        setAoiLayer({contextId: recipeId, aoi, destroy$: componentWillUnmount$})
    }
}

Mosaic.propTypes = {
    recipeId: PropTypes.string,
    aoi: PropTypes.object
}

export default connect(mapStateToProps)(Mosaic)
