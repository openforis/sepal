import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from 'app/home/map/map'
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
                tooltip={msg(`process.ccdc.chartPixel.${isSelecting ? 'cancel' : 'start'}.tooltip`)}
                disabled={disabled}
            />
        )
    }

    startSelecting() {
        const {map, showGoogleSatellite, onPixelSelected} = this.props
        this.setState({isSelecting: true})
        map.onOneClick(latLng => {
            if (showGoogleSatellite) {
                map.removeLayer('googleSatellite')
            }
            this.setState({isSelecting: false})
            onPixelSelected(latLng)
        })
        if (showGoogleSatellite) {
            map.setLayer({id: 'googleSatellite', layer: new GoogleSatelliteLayer({map, layerIndex: 1})})
        }
    }

    cancelSelecting() {
        const {map, showGoogleSatellite} = this.props
        this.setState({isSelecting: false})
        if (showGoogleSatellite) {
            map.removeLayer('googleSatellite')
        }
        map.clearClickListeners()
    }
}

ChartPixelButton.propTypes = {
    onPixelSelected: PropTypes.func.isRequired,
    disabled: PropTypes.any,
    showGoogleSatellite: PropTypes.any,
}

export default compose(
    ChartPixelButton,
    withMap()
)
