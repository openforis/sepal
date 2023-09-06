import {Form} from 'widget/form/form'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import style from './inputImage.module.css'

export default class AssetSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <Form.AssetCombo
                className={style.inputComponent}
                input={input}
                label={msg('process.classChange.panel.inputImage.asset.label')}
                placeholder={msg('process.classChange.panel.inputImage.asset.placeholder')}
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
        const bands = {}
        const categoricalVisualizations = visualizations.filter(({type}) => type === 'categorical')
        metadata.bands.forEach(({id: bandName}) => {
            const visualization = categoricalVisualizations
                .find(({bands}) => bands[0] === bandName) || {}
            bands[bandName] = {
                values: visualization.values || [],
                labels: visualization.labels || [],
                palette: visualization.palette
            }
        })
        onLoaded({
            id: asset,
            bands,
            metadata,
            visualizations,
            recipe: {
                type: 'ASSET',
                id: asset
            }
        })
    }
}

AssetSection.propTypes = {
    input: PropTypes.object.isRequired,
    onLoaded: PropTypes.func.isRequired,
    onLoading: PropTypes.func.isRequired
}
