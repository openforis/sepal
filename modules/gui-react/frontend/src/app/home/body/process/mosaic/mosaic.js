import React from 'react'
import MapToolbar from './mapToolbar'
import Toolbar from './panels/toolbar'
import styles from './mosaic.module.css'
import PropTypes from 'prop-types'
import Panels from './panels/panels'

const Mosaic = (props) =>
    <div className={styles.mosaic}>
        <MapToolbar id={props.id} className={[styles.toolbar, styles.map].join(' ')}/>
        <Toolbar id={props.id} className={[styles.toolbar, styles.mosaic].join(' ')}/>
        <Panels id={props.id} className={styles.panel}/>
    </div>

Mosaic.propTypes = {
    id: PropTypes.string
}

export default Mosaic
