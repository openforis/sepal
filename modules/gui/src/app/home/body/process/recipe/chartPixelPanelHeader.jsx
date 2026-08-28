import PropTypes from 'prop-types'

import {copyToClipboard} from '~/clipboard'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {Panel} from '~/widget/panel/panel'

import styles from './chartPixelPanelHeader.module.css'

const COORDINATE_DECIMALS = 7

export const ChartPixelPanelHeader = ({latLng, suffix}) => {
    const coordinates = [latLng.lat, latLng.lng]
        .map(value => value.toFixed(COORDINATE_DECIMALS))
        .join(', ')
    return (
        <Panel.Header
            icon='chart-area'
            title={(
                <>
                    <span className={styles.coordinates}>{coordinates}</span>
                    <Button
                        additionalClassName={styles.copyButton}
                        air='none'
                        chromeless
                        icon='copy'
                        shape='circle'
                        size='x-small'
                        tooltip={msg('button.copyToClipboard')}
                        tooltipPlacement='top'
                        onClick={() => copyToClipboard(coordinates)}
                    />
                    {suffix ? <span className={styles.suffix}>&ndash; {suffix}</span> : null}
                </>
            )}
        />
    )
}

ChartPixelPanelHeader.propTypes = {
    latLng: PropTypes.shape({
        lat: PropTypes.number.isRequired,
        lng: PropTypes.number.isRequired
    }).isRequired,
    suffix: PropTypes.string
}
