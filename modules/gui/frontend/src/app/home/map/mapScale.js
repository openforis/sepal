import {Button} from 'widget/button'
import {compose} from 'compose'
import {formatCoordinates} from 'coords'
import {withMapsContext} from './maps'
import React from 'react'
import clipboard from 'clipboard'
import format from 'format'
import styles from './mapScale.module.css'

class _MapScale extends React.Component {
    render() {
        const {mapsContext: {center, zoom, scale}} = this.props
        return scale
            ? (
                <div className={styles.container}>
                    <Button
                        look='transparent'
                        shape='pill'
                        size='small'
                        tooltip={
                            this.tooltip(center)
                        }
                        tooltipPlacement='bottomLeft'>
                        {format.number({value: scale, unit: 'm/px'})}
                    </Button>
                </div>
            )
            : null
    }

    tooltip(center) {
        return (
            <Button
                chromeless
                look='highlight'
                icon='globe'
                label={formatCoordinates(center, 5)}
                onClick={() =>
                    clipboard.copy(formatCoordinates(center))
                }
            />
        )
    }
}

export const MapScale = compose(
    _MapScale,
    withMapsContext()
)

MapScale.propTypes = {}
