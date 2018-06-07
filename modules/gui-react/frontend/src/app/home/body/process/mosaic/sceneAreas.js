import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {google, googleMap, MapLayer, MapObject, sepalMap} from 'app/home/map/map'
import backend from 'backend'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {of} from 'rxjs'
import {map} from 'rxjs/operators'
import {connect} from 'store'
import {msg} from 'translate'
import MapStatus from 'widget/mapStatus'
import {SceneSelectionType} from './mosaicRecipe'
import styles from './sceneAreas.module.css'


const mapStateToProps = (state, ownProps) => {
    const recipe = RecipeState(ownProps.recipeId)
    return {
        initialized: recipe('ui.initialized'),
        sceneAreasShown: recipe('ui.sceneAreasShown'),
        aoi: recipe('aoi'),
        source: Object.keys(recipe('sources'))[0],
        sceneSelectionOptions: recipe('sceneSelectionOptions')
    }
}

class SceneAreas extends React.Component {
    state = {
        show: true
    }

    selectScenes(sceneAreaId) {
        console.log('sceneAreaId', sceneAreaId)
    }

    render() {
        const {sceneAreasShown, action} = this.props
        if (this.renderable() && sceneAreasShown && this.state.show)
            return (
                <div>
                    {action('LOAD_SCENE_AREAS').dispatched
                        ? null
                        : <MapStatus message={msg('process.mosaic.sceneAreas.loading')}/>}
                    {this.renderSceneAreas()}
                </div>
            )
        else
            return null
    }

    renderSceneAreas() {
        const sceneAreas = this.state.sceneAreas
        if (sceneAreas)
            return (
                <MapLayer className={styles.sceneAreas}>
                    {sceneAreas.map(sceneArea => this.renderSceneArea(sceneArea))}
                </MapLayer>
            )
        else
            return null
    }

    renderSceneArea({id, center, polygon}) {
        const zoom = sepalMap.getZoom()
        const scale = Math.min(1, Math.pow(zoom, 2.5) / Math.pow(8, 2.5))
        const size = `${4 * scale}rem`
        const halfSize = `${2 * scale}rem`
        return (
            <MapObject
                key={id}
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
                    onClick={() => this.selectScenes(id)}>
                    <circle cx={halfSize} cy={halfSize} r={halfSize}/>
                    {zoom > 4
                        ? <text x={halfSize} y={halfSize} textAnchor='middle' alignmentBaseline="central">
                            64
                        </text>
                        : null}
                </svg>
            </MapObject>
        )
    }

    componentDidUpdate(prevProps) {
        const {recipeId, aoi, source} = this.props
        const loadSceneAreas = this.renderable() && !_.isEqual(
            [aoi, source],
            [prevProps.aoi, prevProps.source])
        if (loadSceneAreas)
            this.loadSceneAreas(aoi, source)
        setSceneAreaLayer({recipeId, component: this})
    }

    renderable() {
        const {aoi, source, sceneSelectionOptions: {type}} = this.props
        return aoi
            && source
            && type === SceneSelectionType.SELECT
    }

    loadSceneAreas(aoi, source) {
        this.props.asyncActionBuilder('LOAD_SCENE_AREAS',
            backend.gee.sceneAreas$(aoi, source)
                .pipe(
                    map((e) => {
                        return this.setState((prevState) =>
                            ({...prevState, sceneAreas: this.toSceneAreas(e.response)})
                        )
                    })
                ))
            .dispatch()
    }

    toSceneAreas(json) {
        return json.map(({polygon, sceneAreaId}) => {
            const gPolygon = new google.maps.Polygon({
                paths: polygon.map(([lat, lng]) =>
                    new google.maps.LatLng(lat, lng)),
                fillColor: '#000000',
                fillOpacity: 0.4,
                strokeColor: '#636363',
                strokeOpacity: 0.6,
                strokeWeight: 1
            })
            const bounds = new google.maps.LatLngBounds()
            gPolygon.getPaths().getArray().forEach((path) =>
                path.getArray().forEach((latLng) =>
                    bounds.extend(latLng)
                ))
            return {
                id: sceneAreaId,
                center: bounds.getCenter(),
                polygon: gPolygon,
            }
        })
    }
}

SceneAreas.propTypes = {
    recipeId: PropTypes.string
}

export default connect(mapStateToProps)(SceneAreas)

const setSceneAreaLayer = ({recipeId, component}) => {
    const layer = component.renderable()
        ? new SceneAreaLayer(component)
        : null
    sepalMap.getContext(recipeId).setLayer({
        id: 'sceneAreas',
        layer,
        destroy$: component.componentWillUnmount$
    })
}

class SceneAreaLayer {
    constructor(component) {
        this.component = component
    }

    equals(o) {
        return o && this.component === o.component
    }

    addToMap() {
        if (!this.component.state.show)
            this.component.setState(prevState => ({...prevState, show: true}))
    }

    removeFromMap() {
        if (this.component.state.show)
            this.component.setState(prevState => ({...prevState, show: false}))
    }

    hide() {
        this.removeFromMap()
    }

    initialize$() {
        return of(this)
    }
}


/*
SELECT geometry
FROM 1EJjaOloQD5NL7ReC5aVtn8cX05xbdEbZthUiCFB6
WHERE ST_INTERSECTS(geometry,  RECTANGLE(LATLNG(36, 5), LATLNG(47, 20)))
*/