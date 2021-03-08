import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMapContext} from 'app/home/map/mapContext'
import GoogleSatelliteLayer from 'app/home/map/googleSatelliteLayer'
import PropTypes from 'prop-types'
import React from 'react'

class ChartPixelButton extends React.Component {
    constructor(props) {
        super(props)
        this.state = {}
    }

    render() {
        const {disabled} = this.props
        const {isSelecting} = this.state
        return (
            <Toolbar.ToolbarButton
                selected={isSelecting}
                onClick={() => isSelecting ? this.cancelSelecting() : this.startSelecting()}
                icon={'chart-area'}
                tooltip={msg(`process.ccdc.mapToolbar.chartPixel.${isSelecting ? 'cancel' : 'start'}.tooltip`)}
                disabled={disabled}
            />
        )
    }

    startSelecting() {
        const {mapContext: {sepalMap, google, googleMap}, showGoogleSatellite, onPixelSelected} = this.props
        this.setState({isSelecting: true})
        sepalMap.onOneClick(latLng => {
            if (showGoogleSatellite) {
                sepalMap.removeLayer('googleSatellite')
            }
            this.setState({isSelecting: false})
            onPixelSelected(latLng)
        })
        if (showGoogleSatellite) {
            sepalMap.setLayer({id: 'googleSatellite', layer: new GoogleSatelliteLayer({google, googleMap, layerIndex: 1})})
        }
    }

    cancelSelecting() {
        const {mapContext: {sepalMap}, showGoogleSatellite} = this.props
        this.setState({isSelecting: false})
        if (showGoogleSatellite) {
            sepalMap.removeLayer('googleSatellite')
        }
        sepalMap.clearClickListeners()
    }
}

ChartPixelButton.propTypes = {
    mapContext: PropTypes.object.isRequired,
    onPixelSelected: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    showGoogleSatellite: PropTypes.any,
}

export default compose(
    ChartPixelButton,
    withMapContext()
)
