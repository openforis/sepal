import PropTypes from 'prop-types'
import React from 'react'
import {Msg, msg} from 'translate'
import Icon from 'widget/icon'
import styles from './aoi.module.css'
import {map} from '../../../../../map/map'

class PolygonSection extends React.Component {
    navigatedBack = false

    componentWillMount() {
        map.drawPolygon('aoi', (polygon) => {
            this.props.inputs.polygon.set(polygon)
        })
    }

    componentWillUnmount() {
        map.disableDrawingMode()
    }

    componentWillReceiveProps(nextProps) {
        const { form, inputs: { section, polygon } } = nextProps
        if (!this.navigatedBack) {
            const fitBounds = true
            map.setPolygon('aoi', polygon.value, fitBounds)
        }
    }

    render() {
        const { form, inputs: { section, polygon } } = this.props
        return <div>
            <div className={styles.header}>
                <a 
                    className={styles.icon}
                    onClick={() => {
                        this.navigatedBack = true
                        map.disableDrawingMode()
                        section.set('')
                    }} 
                    onMouseDown={(e) => e.preventDefault()}>
                    <Icon name='arrow-left' />
                </a>
                <span className={styles.title}><Msg id='process.mosaic.panel.areaOfInterest.form.polygon.title' /></span>
            </div>
            <div className={styles.body}>
                Draw a polygon
                {polygon.value}
            </div>
        </div>
    }

}

export default PolygonSection