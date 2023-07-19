import {Form} from 'widget/form/form'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import guid from 'guid'

class AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        const {inputs: {asset}} = this.props
        return (
            <Form.AssetInput
                input={asset}
                label={msg('process.baytsAlerts.panel.reference.form.asset.label')}
                placeholder={msg('process.baytsAlerts.panel.reference.form.asset.placeholder')}
                autoFocus
                expectedType={['Image', 'ImageCollection']}
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
            .map(visualization => ({...visualization, id: guid()}))
    }
}

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}

export default compose(
    AssetSection,
    connect()
)
