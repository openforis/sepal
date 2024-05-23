import React from 'react'

import {msg} from '~/translate'

import styles from './aoi.module.css'

export class AssetBoundsSection extends React.Component {
    
    render() {
        return (
            <div className={styles.description}>
                {msg('process.mosaic.panel.areaOfInterest.form.assetBounds.description')}
            </div>
        )
    }
}

AssetBoundsSection.propTypes = {}
