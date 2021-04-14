import {MapLayout} from '../body/process/mapLayout/mapLayout'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from './mapContext'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'

class MapToolbar extends React.Component {
    render() {
        const {map, children} = this.props
        return (
            <React.Fragment>
                <MapLayout/>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
                    <Toolbar.ToolbarButton
                        disabled={!map.canZoomIn()}
                        onClick={() => map.zoomIn()}
                        icon={'plus'}
                        tooltip={msg('process.mosaic.mapToolbar.zoomIn.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!map.canZoomOut()}
                        onClick={() => map.zoomOut()}
                        icon={'minus'}
                        tooltip={msg('process.mosaic.mapToolbar.zoomOut.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!map.canZoomArea()}
                        selected={map.isZoomArea()}
                        onClick={() => map.toggleZoomArea()}
                        icon={'search'}
                        tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                    <Toolbar.ToolbarButton
                        disabled={!map.canFit()}
                        onClick={() => map.fit()}
                        icon={'bullseye'}
                        tooltip={msg('process.mosaic.mapToolbar.centerMap.tooltip')}/>
                    <Toolbar.ToolbarButton
                        onClick={() => map.toggleLinked()}
                        selected={map.isLinked()}
                        icon='link'
                        tooltip={msg(map.isLinked() ? 'process.mosaic.mapToolbar.unlink.tooltip' : 'process.mosaic.mapToolbar.link.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='mapLayout'
                        icon='layer-group'
                        tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}/>
                    {children}
                </Toolbar>
                <Keybinding disabled={!map.isZoomArea()} keymap={{Escape: () => map.cancelZoomArea()}}/>
            </React.Fragment>
        )
    }
}

MapToolbar.propTypes = {
    statePath: PropTypes.any.isRequired,
    children: PropTypes.any
}

export default compose(
    MapToolbar,
    withMap()
)
