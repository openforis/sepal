import {connect, select} from 'store'
import {msg} from 'translate'
import Keybinding from 'widget/keybinding'
import {sepalMap} from './map'
import Labels from 'app/home/map/labels'
import PropTypes from 'prop-types'
import React from 'react'
import Toolbar, {ToolbarButton} from 'widget/toolbar'
import styles from './mapToolbar.module.css'

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    zoomLevel: sepalMap.getZoom(),
    hasBounds: sepalMap.getContext(ownProps.mapContext).isLayerInitialized('aoi'),
    isZooming: sepalMap.getContext(ownProps.mapContext).isZooming(),
    metersPerPixel: sepalMap.getMetersPerPixel()
})

class MapToolbar extends React.Component {
    render() {
        const {
            statePath, mapContext, isZooming, labelsShown, labelLayerIndex, hasBounds, metersPerPixel, children
        } = this.props
        const context = sepalMap.getContext(mapContext)
        return (
            <React.Fragment>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
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
                        onClick={() => isZooming ? context.cancelZoomArea() : context.zoomArea()}
                        icon={'search'}
                        tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                    <ToolbarButton
                        disabled={!hasBounds}
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
                <div className={styles.metersPerPixel}>
                    {metersPerPixel}m/px
                </div>
                <Keybinding keymap={isZooming && {Escape: () => context.cancelZoomArea()}}/>
            </React.Fragment>
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
