import {Toolbar, ToolbarButton} from 'widget/toolbar'
import {connect, select} from 'store'
import {msg} from 'translate'
import {sepalMap} from './map'
import Labels from 'app/home/map/labels'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    zoomLevel: sepalMap.getZoom(),
    isZooming: select('map.zooming')
})

class MapToolbar extends React.Component {
    render() {
        const {statePath, mapContext, labelsShown, labelLayerIndex, isZooming, children} = this.props
        return (
            <Toolbar className={styles.mapToolbar} horizontal top right>
                <ToolbarButton
                    disabled={sepalMap.isMaxZoom()}
                    onClick={() => sepalMap.zoomIn()}
                    icon={'plus'}
                    tooltip={msg('process.mosaic.mapToolbar.zoomIn.tooltip')}/>
                <ToolbarButton
                    disabled={sepalMap.isMinZoom()}
                    onClick={() => sepalMap.zoomOut()}
                    icon={'minus'}
                    tooltip={msg('process.mosaic.mapToolbar.zoomOut.tooltip')}/>
                <ToolbarButton
                    selected={isZooming}
                    disabled={sepalMap.isMaxZoom()}
                    onClick={() => sepalMap.zoomArea()}
                    icon={'search'}
                    tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                <ToolbarButton
                    disabled={!sepalMap.getContext(mapContext).hasLayer('aoi')}
                    onClick={() => sepalMap.getContext(mapContext).fitLayer('aoi')}
                    icon={'bullseye'}
                    tooltip={msg('process.mosaic.mapToolbar.centerMap.tooltip')}/>
                <ToolbarButton
                    selected={labelsShown}
                    onClick={() => Labels.showLabelsAction({
                        shown: !labelsShown,
                        layerIndex: labelLayerIndex,
                        statePath,
                        mapContext
                    }).dispatch()}
                    icon={'map-marker-alt'}
                    tooltip={msg(`process.mosaic.mapToolbar.labels.${labelsShown ? 'hide' : 'show'}.tooltip`)}/>
                {children}
            </Toolbar>
        )
    }
}

MapToolbar.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    mapContext: PropTypes.string.isRequired,
    statePath: PropTypes.string.isRequired,
    children: PropTypes.any
}

export default connect(mapStateToProps)(MapToolbar)
