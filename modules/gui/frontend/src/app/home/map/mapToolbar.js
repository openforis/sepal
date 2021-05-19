import {MapLayout} from '../body/process/mapLayout/mapLayout'
import {MapZoomPanel} from './mapZoom'
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
                <MapZoomPanel/>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
                    <Toolbar.ActivationButton
                        id='mapZoom'
                        icon={'search'}
                        tooltip='zoom'/>
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
