import PropTypes from 'prop-types'
import React from 'react'
import styles from './progress.module.css'

export const Progress = ({title, status = 'ACTIVE', className}) =>
    <div className={[styles.progressContainer, className].join(' ')}>
        {title}
        <div className={styles.progress}>
            <div className={[styles.bar, styles[status]].join(' ')}/>
        </div>
    </div>

Progress.propTypes = {
    title: PropTypes.string,
    className: PropTypes.string
}

export const CenteredProgress = ({className, title}) =>
    <div className={[styles.centered, className].join(' ')}>
        <div>
            <Progress title={title}/>
        </div>
    </div>

CenteredProgress.propTypes = {
    className: PropTypes.string,
    title: PropTypes.string
}
