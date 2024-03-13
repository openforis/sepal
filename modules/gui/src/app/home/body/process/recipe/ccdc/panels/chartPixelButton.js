import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from 'app/home/map/mapContext'
import PropTypes from 'prop-types'
import React from 'react'

class _ChartPixelButton extends React.Component {
    state = {
        isSelecting: false,
        clickListener: null
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
        const {map, onPixelSelected} = this.props
        const clickListener = map.addOneShotClickListener(
            latLng => {
                this.setState({isSelecting: false})
                onPixelSelected(latLng)
            }
        )

        this.setState({isSelecting: true, clickListener})
    }

    cancelSelecting() {
        const {clickListener} = this.state
        clickListener && clickListener.remove()
        this.setState({isSelecting: false, clickListener: null})
    }
}

export const ChartPixelButton = compose(
    _ChartPixelButton,
    withMap()
)

ChartPixelButton.propTypes = {
    onPixelSelected: PropTypes.func.isRequired,
    disabled: PropTypes.any
}
