import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {takeUntil} from 'rxjs/operators'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

class AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
    }

    render() {
        const {inputs: {asset, bands, dateFormat}} = this.props
        return (
            <Layout>
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
                <Form.Buttons
                    label={msg('process.ccdc.panel.dates.form.dateFormat.label')}
                    input={dateFormat}
                    disabled={!asset.value}
                    multiple={false}
                    options={[
                        {
                            value: J_DAYS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.jDays.label'),
                            tooltip: msg('process.ccdc.panel.dates.form.dateFormat.jDays.tooltip')
                        },
                        {
                            value: FRACTIONAL_YEARS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.fractionalYears.label'),
                            tooltip: msg('process.ccdc.panel.dates.form.dateFormat.fractionalYears.tooltip')
                        },
                        {
                            value: UNIX_TIME_MILLIS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.unixTimeMillis.label'),
                            tooltip: msg('process.ccdc.panel.dates.form.dateFormat.unixTimeMillis.tooltip')
                        }
                    ]}
                />
            </Layout>
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
