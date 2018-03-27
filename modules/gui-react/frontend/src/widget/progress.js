import React from 'react'
import styles from './progress.module.css'

export const Progress = ({title, className}) =>
    <div className={[styles.progressContainer, className].join(' ')}>
        {title}
        <div className={styles.progress}>
            <div className={styles.indeterminate}/>
        </div>
    </div>

export const CenteredProgress = ({title}) =>
    <div className={styles.centered}>
        <div>
            <Progress title={title}/>
        </div>
    </div>