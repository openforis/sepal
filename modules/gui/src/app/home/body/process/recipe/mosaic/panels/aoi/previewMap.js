import {FeatureLayers} from 'app/home/map/featureLayers'
import {compose} from 'compose'
import {connect} from 'connect'
import {selectFrom} from 'stateUtils'
import {withMapsContext} from 'app/home/map/maps'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import styles from './previewMap.module.css'

const PREVIEW_MAP_OPTIONS = {
    minZoom: 0,
    zoom: 1,
    gestureHandling: 'none',
    draggableCursor: 'default'
}

const mapRecipeToProps = recipe => ({
    recipe,
    featureLayers: selectFrom(recipe, 'layers.overlay.featureLayers') || [],
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
        const {featureLayers} = this.props
        const {map} = this.state
        return (
            <React.Fragment>
                <div className={styles.map} ref={this.refCallback}/>
                {map && featureLayers.length
                    ? <FeatureLayers featureLayers={featureLayers || []} map={map}/>
                    : null}
            </React.Fragment>
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
            const {mapsContext: {createSepalMap}} = this.props
            const map = createSepalMap({element, options: PREVIEW_MAP_OPTIONS})
            this.setState({map})
        }
    }

    componentDidUpdate(prevProps) {
        const {bounds: prevBounds} = prevProps
        const {bounds} = this.props
        const {map} = this.state
        if (map && bounds && !_.isEqual(bounds, prevBounds)) {
            map.fitBounds(bounds)
        }
    }
}

export const PreviewMap = compose(
    _PreviewMap,
    connect(),
    withMapsContext(),
    withRecipe(mapRecipeToProps)
)
