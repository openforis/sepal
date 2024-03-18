import {Form} from '~/widget/form'
import {Subject} from 'rxjs'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {uuid} from '~/uuid'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

class _AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        const {inputs: {asset}} = this.props
        return (
            <Form.AssetCombo
                input={asset}
                label={msg('process.baytsAlerts.panel.reference.form.asset.label')}
                placeholder={msg('process.baytsAlerts.panel.reference.form.asset.placeholder')}
                autoFocus
                allowedTypes={['Image', 'ImageCollection']}
                onLoaded={this.onLoaded}
            />
        )
    }

    onLoaded({metadata}) {
        const {inputs: {asset, bands, startDate, endDate, visualizations}} = this.props
        const reference = toAssetReference(metadata.bands.map(({id}) => id), metadata.properties)
        // TODO: Ensure the expected bands are included
        if (reference.bands.length) {
            bands.set(reference.bands)
            startDate.set(reference.endDate)
            endDate.set(reference.endDate)
            visualizations.set(reference.visualizations)
        } else {
            asset.setInvalid(msg('process.baytsAlerts.panel.reference.asset.notBayTSHistorical'))
        }
    }
}

export const toAssetReference = (bands, properties) => {
    return {
        bands,
        startDate: properties.startDate,
        endDate: properties.endDate,
        visualizations: toVisualizations(properties, bands)
            .map(visualization => ({...visualization, id: uuid()}))
    }
}

export const AssetSection = compose(
    _AssetSection,
    connect()
)

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
