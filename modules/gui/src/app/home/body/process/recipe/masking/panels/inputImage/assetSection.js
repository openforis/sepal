import {Form} from 'widget/form/form'
import {msg} from 'translate'
import {normalize} from 'app/home/map/visParams/visParams'
import PropTypes from 'prop-types'
import React from 'react'
import style from './inputImage.module.css'

export default class AssetSection extends React.Component {
    render() {
        const {input, onLoading} = this.props
        return (
            <Form.AssetInput
                className={style.inputComponent}
                input={input}
                label={msg('process.masking.panel.inputImage.asset.label')}
                placeholder={msg('process.masking.panel.inputImage.asset.placeholder')}
                autoFocus
                expectedType={['Image', 'ImageCollection']}
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
        const normalizedVisualizations = visualizations.map(visParams => normalize(visParams))
        onLoaded({id: asset, bands, metadata, visualizations: normalizedVisualizations})
    }
}

AssetSection.propTypes = {
    input: PropTypes.object.isRequired,
    onLoaded: PropTypes.func.isRequired,
    onLoading: PropTypes.func.isRequired
}
