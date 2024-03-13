import {msg} from '~/translate'
import React from 'react'
import styles from './title.module.css'

export const Title = ({className}) =>
    <div className={[styles.title, className].join(' ')}>
        {msg('landing.title')}
        <hr className={styles.titleUnderline}/>
    </div>

