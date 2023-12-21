import {MapLayout} from '../body/process/mapLayout/mapLayout'
import {MapZoomPanel} from './mapZoom'
import {Toolbar} from 'widget/toolbar/toolbar'
import {compose} from 'compose'
import {connect} from 'store'
import {currentUser} from 'user'
import {msg} from 'translate'
import {withMap} from './mapContext'
import {withSubscriptions} from 'subscription'
import Keybinding from 'widget/keybinding'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './mapToolbar.module.css'

class _MapToolbar extends React.Component {
    state = {
        linked: null,
        renderingEnabled: null,
        pendingTiles: null
    }

    render() {
        const {map, children} = this.props
        const {linked} = this.state
        return (
            <React.Fragment>
                <MapLayout/>
                <MapZoomPanel/>
                <Toolbar
                    className={styles.mapToolbar}
                    horizontal
                    placement='top-right'>
                    {this.renderManualMapRenderingButton()}
                    <Toolbar.ActivationButton
                        id='mapZoom'
                        icon={'search'}
                        tooltip={msg('process.mosaic.mapToolbar.zoom.tooltip')}/>
                    <Toolbar.ToolbarButton
                        onClick={() => map.toggleLinked()}
                        selected={linked}
                        icon='link'
                        tooltip={msg(linked ? 'process.mosaic.mapToolbar.unlink.tooltip' : 'process.mosaic.mapToolbar.link.tooltip')}/>
                    <Toolbar.ActivationButton
                        id='mapLayout'
                        icon='layer-group'
                        tooltip={msg('process.mosaic.mapToolbar.layers.tooltip')}/>
                    {children}
                </Toolbar>
                <Keybinding disabled={!map.isZoomArea()} keymap={{Escape: () => map.disableZoomArea()}}/>
            </React.Fragment>
        )
    }

    renderManualMapRenderingButton() {
        const {map, user} = this.props
        const {renderingEnabled, pendingTiles} = this.state
        return user?.manualMapRenderingEnabled && pendingTiles ? (
            <Toolbar.ToolbarButton
                onClick={map.toggleRendering}
                selected={renderingEnabled}
                icon={renderingEnabled ? 'pause' : 'play'}
                tooltip={msg('process.mosaic.mapToolbar.mapRendering.tooltip')}/>
        ) : null
    }

    componentDidMount() {
        const {map, addSubscription} = this.props
        addSubscription(
            map.linked$.subscribe(
                linked => this.setState({linked})
            ),
            map.renderingEnabled$.subscribe(
                renderingEnabled => this.setState({renderingEnabled})
            ),
            map.renderingProgress$.subscribe(
                pendingTiles => {
                    this.setState({pendingTiles})
                    if (!pendingTiles) {
                        map.setRendering(false)
                    }
                }
            )
        )
    }
}

export const MapToolbar = compose(
    _MapToolbar,
    connect(() => ({
        user: currentUser()
    })),
    withMap(),
    withSubscriptions()
)

MapToolbar.propTypes = {
    statePath: PropTypes.any.isRequired,
    children: PropTypes.any
}
