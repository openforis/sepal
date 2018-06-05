import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {connect} from 'store'
import {Msg, msg} from 'translate'
import {sepalMap} from '../../../../../map/map'
import PanelContent from '../panelContent'
import styles from './aoi.module.css'

class PolygonSection extends React.Component {
    componentWillMount() {
        const {recipeId, inputs: {polygon}} = this.props
        sepalMap.getContext(recipeId).drawPolygon('aoi', (drawnPolygon) => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        this.disableDrawingMode()
    }

    disableDrawingMode() {
        const {recipeId} = this.props
        sepalMap.getContext(recipeId).disableDrawingMode()
    }

    updateBounds(updatedBounds) {
        const {recipeId, inputs: {bounds}} = this.props
        bounds.set(updatedBounds)
        sepalMap.getContext(recipeId).fitLayer('aoi')
    }

    render() {
        const {className, inputs: {section}} = this.props
        return (
            <PanelContent
                title={msg('process.mosaic.panel.areaOfInterest.form.polygon.title')}
                className={className}
                onBack={() => {
                    this.disableDrawingMode()
                    section.set('')
                }}>
                <div className={styles.polygon}>
                    <Msg id='process.mosaic.panel.areaOfInterest.form.polygon.description'/>
                </div>
            </PanelContent>
        )
    }

    componentDidUpdate(prevProps) {
        if (prevProps.inputs === this.props.inputs)
            return

        const {recipeId, inputs: {polygon, bounds}, componentWillUnmount$} = this.props
        setAoiLayer({
            contextId: recipeId,
            aoi: {
                type: 'polygon',
                path: polygon.value,
                bounds: bounds.value
            },
            fill: true,
            destroy$: componentWillUnmount$,
            onInitialized: (layer) => this.updateBounds(layer.bounds)
        })
    }

}

PolygonSection.propTypes = {
    recipeId: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired,
    className: PropTypes.string.isRequired
}

export default connect()(PolygonSection)