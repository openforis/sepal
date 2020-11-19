import React from 'react'
import PropTypes from 'prop-types'
import styles from './legend.module.css'

export const Legend = ({min, max, palette}) =>
    <div className={styles.legend}>
        <div className={styles.labels}>
            <div>{max}</div>
            <div>{min}</div>
        </div>
        <div className={styles.palette} style={{'--palette': palette}}/>
    </div>


Legend.propTypes = {
    min: PropTypes.any.isRequired,
    max: PropTypes.any.isRequired,
    palette: PropTypes.any.isRequired

}