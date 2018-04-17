import React from 'react'
import MosaicToolbar from './toolbar'
import styles from './mosaic.module.css'

const Mosaic = (props) =>
    <div>
        <MosaicToolbar id={props.id} className={styles.toolbar}/>
        <h2>Mosaic</h2>
        <input placeholder='Some input'/>
    </div>

export default Mosaic
