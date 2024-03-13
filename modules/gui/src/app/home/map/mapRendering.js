import {Button} from '~/widget/button'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {withMap} from './mapContext'
import {withSubscriptions} from '~/subscription'
import {withTab} from '~/widget/tabs/tabContext'
import React from 'react'
import styles from './mapRendering.module.css'

class _MapRendering extends React.PureComponent {
    state = {
        renderingEnabled: null,
        pendingTiles: null,
        busy: false
    }

    render() {
        return (
            <div className={styles.container}>
                {this.renderButton()}
            </div>
        )
    }

    renderButton() {
        const {pendingTiles, busy} = this.state
        if (pendingTiles) {
            return this.renderRenderingButton()
        }
        if (busy) {
            return this.renderProcessingButton()
        }
        return null
    }

    renderProcessingButton() {
        return (
            <Button
                look='default'
                size='small'
                icon='spinner'
                iconAttributes={{fixedWidth: true}}
                label={msg('process.mosaic.mapToolbar.mapRendering.processing')}
            />
        )
    }

    renderRenderingButton() {
        const {map} = this.props
        const {renderingEnabled, pendingTiles} = this.state
        return (
            <Button
                look={renderingEnabled ? 'cancel' : 'add'}
                size='small'
                icon={renderingEnabled ? 'pause' : 'play'}
                iconAttributes={{fixedWidth: true}}
                label={msg('process.mosaic.mapToolbar.mapRendering.tiles', {tiles: pendingTiles})}
                tooltip={msg('process.mosaic.mapToolbar.mapRendering.tooltip')}
                onClick={map.toggleRendering}
            />
        )
    }

    componentDidMount() {
        const {map: {renderingEnabled$, renderingProgress$}, tab: {busy$}, addSubscription} = this.props
        addSubscription(
            renderingEnabled$.subscribe(
                renderingEnabled => setImmediate(() => this.setState({renderingEnabled}))
            ),
            renderingProgress$.subscribe(
                pendingTiles => setImmediate(() => this.setState({pendingTiles}))
            ),
            busy$.subscribe(
                ({busy}) => setImmediate(() => this.setState({busy}))
            )
        )
    }
}

export const MapRendering = compose(
    _MapRendering,
    withMap(),
    withTab(),
    withSubscriptions()
)

MapRendering.propTypes = {}
