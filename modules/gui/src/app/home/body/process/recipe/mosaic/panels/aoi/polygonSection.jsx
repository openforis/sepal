import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withMap} from '~/app/home/map/mapContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Layout} from '~/widget/layout'

import styles from './aoi.module.css'
import {PreviewMap} from './previewMap'

const mapRecipeToProps = recipe => ({
    overlay: selectFrom(recipe, 'layers.overlay'),
    featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources'),
})

class _PolygonSection extends React.Component {
    constructor(props) {
        super(props)
        this.wereLabelsShown = props.labelsShown
        this.boundsChanged$ = new Subject()
    }

    componentDidMount() {
        const {map, inputs: {polygon}} = this.props
        map.enablePolygonDrawing(drawnPolygon => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        const {map} = this.props
        this.boundsChanged$.next()
        this.boundsChanged$.complete()
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
        const {stream, overlay: prevOverlay, featureLayerSources, recipeActionBuilder, inputs: {polygon}} = this.props
        if (!polygon.value) {
            // No polygon drawn yet (or cleared): drop any stale overlay/bounds and cancel a pending request.
            if (prevOverlay) {
                this.boundsChanged$.next()
                recipeActionBuilder('CLEAR_MAP_OVERLAY')
                    .del('layers.overlay')
                    .del('ui.overlay.bounds')
                    .dispatch()
            }
            return
        }
        const aoi = {
            type: 'POLYGON',
            path: polygon.value
        }
        const aoiLayerSource = featureLayerSources.find(({type}) => type === 'Aoi')
        const overlay = {
            featureLayers: [
                {
                    sourceId: aoiLayerSource.id,
                    layerConfig: {aoi}
                }
            ]
        }
        if (!_.isEqual(overlay, prevOverlay)) {
            // Cancel any in-flight bounds request so a late response for the previous polygon can't
            // overwrite the bounds for this newer one.
            this.boundsChanged$.next()
            recipeActionBuilder('DELETE_MAP_OVERLAY_BOUNDS')
                .del('ui.overlay.bounds')
                .dispatch()
            stream('LOAD_MAP_OVERLAY_BOUNDS',
                api.gee.aoiBounds$(aoi).pipe(
                    takeUntil(this.boundsChanged$)
                ),
                bounds => {
                    recipeActionBuilder('SET_MAP_OVERLAY_BOUNDS')
                        .set('ui.overlay.bounds', bounds)
                        .dispatch()
                }
            )
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
