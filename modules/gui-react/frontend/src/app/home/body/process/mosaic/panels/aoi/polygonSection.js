import {setAoiLayer} from 'app/home/map/aoiLayer'
import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import {map} from '../../../../../map/map'
import PanelContent from '../panelContent'
import styles from './aoi.module.css'

class PolygonSection extends React.Component {
    componentWillMount() {
        map.drawPolygon('aoi', (polygon) => {
            this.props.inputs.polygon.set(polygon)
        })
    }

    componentWillUnmount() {
        map.disableDrawingMode()
    }

    render() {
        const {className, inputs: {section}} = this.props
        return (
            <PanelContent
                title={msg('process.mosaic.panel.areaOfInterest.form.polygon.title')}
                className={className}
                onBack={() => {
                    map.disableDrawingMode()
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

        const {id, inputs: {polygon}} = this.props
        setAoiLayer(id, {
                type: 'polygon',
                path: polygon.value
            }, () => map.getLayers(id).fit('aoi')
        )
    }

}

PolygonSection.propTypes = {
    id: PropTypes.string.isRequired,
    inputs: PropTypes.object.isRequired,
    className: PropTypes.string.isRequired
}

export default PolygonSection