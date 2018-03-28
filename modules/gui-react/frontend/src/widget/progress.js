import React from 'react'
import styles from './progress.module.css'
import PropTypes from 'prop-types'

export const Progress = ({title, className}) =>
    <div className={[styles.progressContainer, className].join(' ')}>
        {title}
        <div className={styles.progress}>
            <div className={styles.indeterminate}/>
        </div>
    </div>

Progress.propTypes = {
    title: PropTypes.string,
    className: PropTypes.string
}

export const CenteredProgress = ({title}) =>
    <div className={styles.centered}>
        <div>
            <Progress title={title}/>
        </div>
    </div>

CenteredProgress.propTypes = {
    title: PropTypes.string
}
