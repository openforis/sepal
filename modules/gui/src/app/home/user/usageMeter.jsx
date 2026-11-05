import PropTypes from 'prop-types'

import styles from './usageMeter.module.css'

// A percentage on a 0-100 line: a dim track, a solid bar up to `value` and, when given, a tick at
// `tick`. Without a value, the bare track says there is nothing to show.
export const UsageMeter = ({value, tick, color, label}) =>
    <div
        className={styles.meter}
        role='img'
        aria-label={label}
        title={label}
        style={{'--color': color}}>
        {value == null ? null : <div className={styles.bar} style={{width: `${value}%`}}/>}
        {tick == null ? null : <div className={styles.tick} style={{left: `${tick}%`}}/>}
    </div>

UsageMeter.propTypes = {
    color: PropTypes.string.isRequired,
    label: PropTypes.string.isRequired,
    tick: PropTypes.number,
    value: PropTypes.number
}
