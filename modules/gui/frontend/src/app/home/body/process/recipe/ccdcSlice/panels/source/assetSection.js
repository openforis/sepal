import {Form} from 'widget/form/form'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {takeUntil} from 'rxjs/operators'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

class AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
    }

    render() {
        const {inputs: {asset, bands}} = this.props
        return (
            <Form.Input
                label={msg('process.ccdcSlice.panel.source.form.asset.label')}
                autoFocus
                input={asset}
                placeholder={msg('process.ccdcSlice.panel.source.form.asset.placeholder')}
                spellCheck={false}
                onChange={() => bands.set(null)}
                onChangeDebounced={asset => asset && this.loadMetadata(asset)}
                errorMessage
                busyMessage={this.props.stream('LOAD_ASSET_METADATA').active && msg('widget.loading')}
            />
        )
    }

    loadMetadata(asset) {
        this.assetChanged$.next()
        this.props.stream('LOAD_ASSET_METADATA',
            api.gee.imageMetadata$({asset}).pipe(
                takeUntil(this.assetChanged$)),
            metadata => this.updateMetadata(metadata),
            error => {
                this.props.inputs.asset.setInvalid(
                    error.response
                        ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                        : msg('asset.failedToLoad')
                )
            }
        )
    }

    updateMetadata(metadata) {
        const assetBands = _.intersection(...['coefs', 'magnitude', 'rmse']
            .map(postfix => metadata.bands
                .map(assetBand => assetBand.match(`(.*)_${postfix}`))
                .map(match => match && match[1])
                .filter(band => band)
            )
        )
        const {inputs: {asset, bands, dateFormat, startDate, endDate, surfaceReflectance}} = this.props
        if (assetBands) {
            bands.set(assetBands)
            dateFormat.set(metadata.dateFormat)
            startDate.set(metadata.startDate)
            endDate.set(metadata.endDate)
            surfaceReflectance.set(metadata.surfaceReflectance)
        } else {
            asset.setInvalid(msg('process.ccdcSlice.panel.source.form.asset.notCCDC'))
        }
    }
}

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}

export default compose(
    AssetSection,
    connect()
)
