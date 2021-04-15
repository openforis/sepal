import {compose} from 'compose'
import {connect} from 'store'
import {getLogger} from 'log'
import {selectFrom} from 'stateUtils'
import {updateFeatureLayers} from 'app/home/map/featureLayers'
import {withMapsContext} from 'app/home/map/maps'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './previewMap.module.css'

const log = getLogger('previewMap')

const mapRecipeToProps = recipe => ({
    recipe,
    selectedLayers: selectFrom(recipe, 'layers.overlay.featureLayers'),
    bounds: selectFrom(recipe, 'ui.overlay.bounds')
})

class _PreviewMap extends React.Component {
    state = {
        map: null
    }

    constructor() {
        super()
        this.refCallback = this.refCallback.bind(this)
    }

    render() {
        return (
            <div className={styles.map} ref={this.refCallback}/>
        )
    }

    refCallback(element) {
        if (element) {
            this.createMap(element)
        }
    }

    createMap(element) {
        const {map} = this.state
        if (!map) {
            log.debug('creating map')
            const {mapsContext: {createSepalMap}} = this.props
            const map = createSepalMap(element, {minZoom: 1, zoom: 1})
            const {google, googleMap} = map.getGoogle()
            google.maps.event.addListenerOnce(googleMap, 'idle', () => {
                this.setState({map})
            })
        }
    }

    componentDidUpdate(prevProps) {
        const {bounds: prevBounds} = prevProps
        const {recipe, selectedLayers, bounds} = this.props
        const {map} = this.state
        if (map) {
            updateFeatureLayers({map, recipe, selectedLayers})

            if (bounds && !_.isEqual(bounds, prevBounds)) {
                map.fitBounds(bounds)
            }
        }
    }
}

export const PreviewMap = compose(
    _PreviewMap,
    connect(),
    withMapsContext(),
    withRecipe(mapRecipeToProps)
)
