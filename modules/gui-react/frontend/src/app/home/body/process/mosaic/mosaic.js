import React from 'react'
import MapToolbar from './mapToolbar'
import MosaicToolbar from './mosaicToolbar'
import styles from './mosaic.module.css'
import PropTypes from 'prop-types'

const Mosaic = (props) =>
    <div>
        <MapToolbar id={props.id} className={[styles.toolbar, styles.map].join(' ')}/>
        <MosaicToolbar id={props.id} className={[styles.toolbar, styles.mosaic].join(' ')}/>
    </div>

Mosaic.propTypes = {
    id: PropTypes.string
}

export default Mosaic
