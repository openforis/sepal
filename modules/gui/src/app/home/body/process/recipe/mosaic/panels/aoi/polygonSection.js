import {Layout} from 'widget/layout'
import {PreviewMap} from './previewMap'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMap} from 'app/home/map/mapContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'apiRegistry'
import styles from './aoi.module.css'

const mapRecipeToProps = recipe => ({
    overlay: selectFrom(recipe, 'layers.overlay'),
    featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
})

class _PolygonSection extends React.Component {
    constructor(props) {
        super(props)
        this.wereLabelsShown = props.labelsShown
    }

    componentDidMount() {
        const {map, inputs: {polygon}} = this.props
        map.enablePolygonDrawing(drawnPolygon => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        const {map} = this.props
        map.disablePolygonDrawing()
    }

    render() {
        return (
            <Layout spacing='compact'>
                <div className={styles.description}>
                    {msg('process.mosaic.panel.areaOfInterest.form.polygon.description')}
                </div>
                <PreviewMap/>
            </Layout>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs) {
            return
        }

        this.setOverlay()
    }

    setOverlay() {
        const {stream, inputs: {polygon}} = this.props
        const aoi = {
            type: 'POLYGON',
            path: polygon.value
        }
        const {overlay: prevOverlay, featureLayerSources, recipeActionBuilder} = this.props
        const aoiLayerSource = featureLayerSources.find(({type}) => type === 'Aoi')
        const overlay = {
            featureLayers: [
                {
                    sourceId: aoiLayerSource.id,
                    layerConfig: {aoi}
                }
            ]
        }
        if (!_.isEqual(overlay, prevOverlay) && !stream('LOAD_BOUNDS').active) {
            recipeActionBuilder('DELETE_MAP_OVERLAY_BOUNDS')
                .del('ui.overlay.bounds')
                .dispatch()
            if (aoi.path) {
                stream('LOAD_MAP_OVERLAY_BOUNDS',
                    api.gee.aoiBounds$(aoi),
                    bounds => {
                        recipeActionBuilder('SET_MAP_OVERLAY_BOUNDS')
                            .set('ui.overlay.bounds', bounds)
                            .dispatch()
                    }
                )
            }
            recipeActionBuilder('SET_MAP_OVERLAY')
                .set('layers.overlay', overlay)
                .dispatch()
        }
    }

}

export const PolygonSection = compose(
    _PolygonSection,
    withRecipe(mapRecipeToProps),
    withMap()
)

PolygonSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired,
    labelsShown: PropTypes.any
}
