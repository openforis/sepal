import React from 'react'
import {connect} from 'store'
import {Msg} from 'translate'
import styles from './aoiSelection.module.css'

const AoiSelection = ({className}) =>
    <div className={className}>
        <div className={styles.container}>
            <Msg id={`process.mosaic.panel.areaOfInterest.title`}/>
        </div>
    </div>

export default AoiSelection