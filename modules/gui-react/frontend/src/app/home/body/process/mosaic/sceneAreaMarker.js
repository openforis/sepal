import {RecipeActions, RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {googleMap, MapObject, sepalMap} from 'app/home/map/map'
import React from 'react'
import {connect} from 'store'
import styles from './sceneAreas.module.css'

const mapStateToProps = (state, ownProps) => {
    const {recipeId, sceneAreaId} = ownProps
    const recipe = RecipeState(recipeId)
    const selectedScenes = recipe(['scenes', sceneAreaId]) || []
    return {
        selectedSceneCount: selectedScenes.length
    }
}

class SceneAreaMarker extends React.Component {
    constructor(props) {
        super(props)
        this.recipe = RecipeActions(props.recipeId)
    }

    render() {
        const {sceneAreaId, center, polygon, selectedSceneCount} = this.props
        const zoom = sepalMap.getZoom()
        const scale = Math.min(1, Math.pow(zoom, 2.5) / Math.pow(8, 2.5))
        const size = `${4 * scale}rem`
        const halfSize = `${2 * scale}rem`
        return (
            <MapObject
                lat={center.lat()}
                lng={center.lng()}
                width={size}
                height={size}
                className={styles.sceneArea}>
                <svg
                    height={size}
                    width={size}
                    onMouseOver={() => polygon.setMap(googleMap)}
                    onMouseLeave={() => polygon.setMap(null)}
                    onClick={() => this.selectScenes(sceneAreaId)}>
                    <circle cx={halfSize} cy={halfSize} r={halfSize}/>
                    {zoom > 4
                        ? <text x={halfSize} y={halfSize} textAnchor='middle' alignmentBaseline="central">
                            {selectedSceneCount}
                        </text>
                        : null}
                </svg>
            </MapObject>
        )
    }

    selectScenes(sceneAreaId) {
        this.recipe.setSceneSelection(sceneAreaId).dispatch()
    }

}

export default connect(mapStateToProps)(SceneAreaMarker)