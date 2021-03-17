import {LayersMenu} from './layersMenu'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from './map'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'

class MapToolbar extends React.Component {
    render() {
        const {statePath, map, zoomArea, labelLayerIndex, toggleLinked, linked, children} = this.props
        const hasBounds = map.isLayerInitialized('aoi')
        return (
            <React.Fragment>
                <LayersMenu statePath={statePath} labelLayerIndex={labelLayerIndex}/>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
                    <Toolbar.ToolbarButton
                        disabled={map.isMaxZoom()}
                        onClick={() => map.zoomIn()}
                        icon={'plus'}
                        tooltip={msg('process.mosaic.mapToolbar.zoomIn.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={map.isMinZoom()}
                        onClick={() => map.zoomOut()}
                        icon={'minus'}
                        tooltip={msg('process.mosaic.mapToolbar.zoomOut.tooltip')}/>
                    <Toolbar.ToolbarButton
                        selected={zoomArea}
                        disabled={map.isMaxZoom()}
                        onClick={() => zoomArea ? map.cancelZoomArea() : map.zoomArea()}
                        icon={'search'}
                        tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!hasBounds}
                        onClick={() => toggleLinked()}
                        selected={linked}
                        icon='link'
                        tooltip={msg(linked ? 'process.mosaic.mapToolbar.unlink.tooltip' : 'process.mosaic.mapToolbar.link.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!hasBounds}
                        onClick={() => map.fitLayer('aoi')}
                        icon={'bullseye'}
                        tooltip={msg('process.mosaic.mapToolbar.centerMap.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='layersMenu'
                        icon='layer-group'
                        tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}/>
                    {children}
                </Toolbar>
                <Keybinding disabled={!zoomArea} keymap={{Escape: () => map.cancelZoomArea()}}/>
            </React.Fragment>
        )
    }
}

MapToolbar.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    statePath: PropTypes.any.isRequired,
    children: PropTypes.any
}

export default compose(
    MapToolbar,
    withMap()
)
