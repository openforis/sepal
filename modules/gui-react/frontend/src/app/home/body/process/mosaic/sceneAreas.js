import {RecipeState} from 'app/home/body/process/mosaic/mosaicRecipe'
import {google, sepalMap} from 'app/home/map/map'
import backend from 'backend'
import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {of} from 'rxjs'
import {map} from 'rxjs/operators'
import {connect} from 'store'
import {SceneSelectionType} from './mosaicRecipe'


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
    state = {}

    render() {
        const {initialized, sceneSelectionOptions: {type}} = this.props
        if (!initialized || type !== SceneSelectionType.SELECT)
            return null
        return (
            <div>
                {/*Scene areas*/}
            </div>
        )
    }

    componentDidUpdate() {
        const {sceneAreasShown, recipeId} = this.props
        if (sceneAreasShown)
            setSceneAreaLayer(this.props)
        sepalMap.getContext(recipeId).hideLayer('sceneAreas', !sceneAreasShown)
    }
}

SceneAreas.propTypes = {
    recipeId: PropTypes.string
}


export default connect(mapStateToProps)(SceneAreas)


const setSceneAreaLayer = (
    {
        recipeId,
        aoi,
        source,
        sceneSelectionOptions,
        componentWillUnmount$,
        onInitialized
    }) => {
    const layer =
        aoi
        && source
        && sceneSelectionOptions.type === SceneSelectionType.SELECT
            ? new SceneAreaLayer({aoi, source})
            : null
    sepalMap.getContext(recipeId).setLayer({
        id: 'sceneAreas',
        layer,
        destroy$: componentWillUnmount$,
        onInitialized
    })
}

class SceneAreaLayer {
    constructor({aoi, source}) {
        this.aoi = aoi
        this.source = source
        this.bounds = aoi.bounds
        this.listeners = []
    }

    equals(o) {
        return o && _.isEqual(
            {aoi: this.aoi, source: this.source},
            {aoi: o.aoi, source: o.source})
    }

    addListener({object, event, listener}) {
        this.listeners.push({
            object, event, listener,
            gListener: google.maps.event.addListener(object, event, listener)
        })
    }

    addToMap(googleMap) {
        if (this.layer) {
            this.listeners.forEach((listener) => this.addListener(listener))
            return this.layer.set('sceneAreas', googleMap)
        }
        this.layer = new google.maps.MVCObject()
        this.layer.setValues({sceneAreas: googleMap})

        this.sceneAreas.map(({polygon, sceneAreaId}) => {
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
            const center = bounds.getCenter()

            const icon = (zoom) => ({
                path: google.maps.SymbolPath.CIRCLE,
                fillColor: '#000000',
                fillOpacity: 0.4,
                anchor: new google.maps.Point(0, 0),
                strokeColor: '#636363',
                strokeOpacity: 0.6,
                strokeWeight: 2,
                scale: 30
            })
            const marker = new google.maps.Marker({
                position: center,
                map: googleMap,
                draggable: false
            })

            const updateMarker = () => {
                const zoom = googleMap.getZoom()
                const scale = () => {
                    switch (zoom) {
                        case 6:
                            return 20
                        case 5:
                            return 13
                        case 4:
                            return 3
                        case 3:
                        case 2:
                        case 1:
                            return 2
                        default:
                            return 30
                    }
                }
                marker.setLabel(zoom > 4
                    ? {
                        text: '65',
                        color: '#FFFFFF',
                        fontSize: zoom > 6 ? '0.9rem' : '0.7rem'
                    }
                    : null)
                marker.setIcon({...icon(zoom), scale: scale(zoom)})
            }
            updateMarker()
            this.addListener({object: marker, event: 'mouseover', listener: () => gPolygon.setMap(googleMap)})
            this.addListener({object: marker, event: 'mouseout', listener: () => gPolygon.setMap(null)})
            this.addListener({
                object: googleMap,
                event: 'zoom_changed',
                listener: () => updateMarker()
            })
            marker.bindTo('map', this.layer, 'sceneAreas')
            return null
        })
    }

    removeFromMap(googleMap) {
        if (this.layer) {
            this.layer.set('sceneAreas', null)
            this.listeners.forEach(({gListener}) => google.maps.event.removeListener(gListener))
        }
    }

    hide(googleMap, hidden) {
        if (this.layer)
            this.layer.set('sceneAreas', hidden ? null : googleMap)
    }

    initialize$() {
        if (this.sceneAreas)
            return of(this)
        return backend.gee.sceneAreas$(this.aoi, this.source).pipe(
            map((e) => this.sceneAreas = e.response),
            map(() => this)
        )
    }
}

/*
SELECT geometry
FROM 1EJjaOloQD5NL7ReC5aVtn8cX05xbdEbZthUiCFB6
WHERE ST_INTERSECTS(geometry,  RECTANGLE(LATLNG(36, 5), LATLNG(47, 20)))
*/