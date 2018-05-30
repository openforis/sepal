import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {map} from '../../../../../map/map'
import PanelContent from '../panelContent'
import styles from './aoi.module.css'
import {connect} from 'store'

class PolygonSection extends React.Component {
    componentWillMount() {
        const {id, inputs: {polygon}} = this.props
        map.getLayers(id).drawPolygon('aoi', (drawnPolygon) => {
            polygon.set(drawnPolygon)
        })
    }

    componentWillUnmount() {
        this.disableDrawingMode()
    }

    disableDrawingMode() {
        const {id} = this.props
        map.getLayers(id).disableDrawingMode()
    }

    updateBounds(updatedBounds) {
        const {id, inputs: {bounds}} = this.props
        bounds.set(updatedBounds)
        map.getLayers(id).fit('aoi')
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

        const {id, inputs: {polygon}, componentWillUnmount$} = this.props
        setAoiLayer(
            id,
            {
                type: 'polygon',
                path: polygon.value
            },
            componentWillUnmount$,
            (layer) => this.updateBounds(layer.bounds)
        )
    }

}

PolygonSection.propTypes = {
    id: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired,
    className: PropTypes.string.isRequired
}

export default connect()(PolygonSection)