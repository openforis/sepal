import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

import style from './inputImage.module.css'

export class AssetSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <Form.AssetCombo
                className={style.inputComponent}
                input={input}
                label={msg('process.indexChange.panel.inputImage.asset.label')}
                placeholder={msg('process.indexChange.panel.inputImage.asset.placeholder')}
                autoFocus
                allowedTypes={['Image', 'ImageCollection']}
                onLoading={onLoading}
                onLoaded={({asset, metadata, visualizations}) => {
                    this.onLoaded({asset, metadata, visualizations})
                }}
            />
        )
    }

    onLoaded({asset, metadata, visualizations}) {
        const {onLoaded} = this.props
        const bands = metadata.bands.map(({id}) => id)
        onLoaded({id: asset, bands, metadata, visualizations})
    }
}

AssetSection.propTypes = {
    input: PropTypes.object.isRequired,
    onLoaded: PropTypes.func.isRequired,
    onLoading: PropTypes.func.isRequired
}
