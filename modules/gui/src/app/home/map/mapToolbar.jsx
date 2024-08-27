import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {Keybinding} from '~/widget/keybinding'
import {Toolbar} from '~/widget/toolbar/toolbar'

import {MapLayout, MapLayoutButton} from '../body/process/mapLayout/mapLayout'
import {withMap} from './mapContext'
import {MapOptionsButton, MapOptionsPanel} from './mapOptions'
import styles from './mapToolbar.module.css'
import {MapZoomButton, MapZoomPanel} from './mapZoom'

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
