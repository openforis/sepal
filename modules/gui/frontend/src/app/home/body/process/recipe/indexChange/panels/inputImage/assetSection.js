import {AssetInput} from 'widget/assetInput'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import style from './inputImage.module.css'

export default class AssetSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <AssetInput
                className={style.inputComponent}
                input={input}
                label={msg('process.classification.panel.inputImagery.form.asset.label')}
                placeholder={msg('process.classification.panel.inputImagery.form.asset.placeholder')}
                autoFocus
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
        metadata.bands.forEach(bandName => {
            const visualization = categoricalVisualizations
                .find(({bands}) => bands[0] === bandName) || {}
            bands[bandName] = {
                values: visualization.values || [],
                labels: visualization.labels || [],
            }
        })
        onLoaded({id: asset, bands, metadata, visualizations})
    }
}

AssetSection.propTypes = {
    input: PropTypes.object.isRequired,
    onLoaded: PropTypes.func.isRequired,
    onLoading: PropTypes.func.isRequired
}
