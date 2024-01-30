import {Button} from 'widget/button'
import {compose} from 'compose'
import {msg} from 'translate'
import {withMap} from './mapContext'
import {withSubscriptions} from 'subscription'
import React from 'react'
import styles from './mapRendering.module.css'

class _MapRendering extends React.PureComponent {
    state = {
        renderingEnabled: null,
        pendingTiles: null
    }

    render() {
        return (
            <div className={styles.container}>
                {this.renderManualMapRenderingButton()}
            </div>
        )
    }

    renderManualMapRenderingButton() {
        const {map} = this.props
        const {renderingEnabled, pendingTiles} = this.state
        return pendingTiles ? (
            <Button
                look={renderingEnabled ? 'cancel' : 'add'}
                size='small'
                icon={renderingEnabled ? 'pause' : 'play'}
                iconAttributes={{fixedWidth: true}}
                label={`${pendingTiles} tiles`}
                tooltip={msg('process.mosaic.mapToolbar.mapRendering.tooltip')}
                onClick={map.toggleRendering}
            />
        ) : null
    }

    componentDidMount() {
        const {map: {renderingEnabled$, renderingProgress$}, addSubscription} = this.props
        addSubscription(
            renderingProgress$.subscribe(
                pendingTiles => this.setState({pendingTiles})

            ),
            renderingEnabled$.subscribe(
                renderingEnabled => this.setState({renderingEnabled})
            )
        )
    }
}

export const MapRendering = compose(
    _MapRendering,
    withMap(),
    withSubscriptions()
)

MapRendering.propTypes = {}
