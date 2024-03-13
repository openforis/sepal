import {Keybinding} from 'widget/keybinding'
import {MapLayout, MapLayoutButton} from '../body/process/mapLayout/mapLayout'
import {MapOptionsButton, MapOptionsPanel} from './mapOptions'
import {MapZoomButton, MapZoomPanel} from './mapZoom'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {withMap} from './mapContext'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'

class _MapToolbar extends React.Component {
    render() {
        const {map, statePath, children} = this.props
        return (
            <React.Fragment>
                <MapZoomPanel/>
                <MapOptionsPanel statePath={statePath}/>
                <MapLayout/>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
                    <MapZoomButton/>
                    <MapOptionsButton/>
                    <MapLayoutButton/>
                    {children}
                </Toolbar>
                <Keybinding disabled={!map.isZoomArea()} keymap={{Escape: () => map.disableZoomArea()}}/>
            </React.Fragment>
        )
    }
}

export const MapToolbar = compose(
    _MapToolbar,
    withMap()
)

MapToolbar.propTypes = {
    statePath: PropTypes.any.isRequired,
    children: PropTypes.any
}
