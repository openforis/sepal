import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

class _AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
        this.onChange = this.onChange.bind(this)
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        const {labelButtons, inputs: {asset, dateFormat}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    input={asset}
                    label={msg('process.changeAlerts.panel.reference.form.asset.label')}
                    labelButtons={labelButtons}
                    placeholder={msg('process.changeAlerts.panel.reference.form.asset.placeholder')}
                    autoFocus
                    allowedTypes={['Image', 'ImageCollection']}
                    onChange={this.onChange}
                    onLoaded={this.onLoaded}
                />
                <Form.Buttons
                    label={msg('process.ccdc.panel.dates.form.dateFormat.label')}
                    input={dateFormat}
                    disabled={!asset.value}
                    multiple={false}
                    options={[
                        {
                            value: J_DAYS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.jDays.label')
                        },
                        {
                            value: FRACTIONAL_YEARS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.fractionalYears.label')
                        },
                        {
                            value: UNIX_TIME_MILLIS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.unixTimeMillis.label')
                        }
                    ]}
                />
            </Layout>
        )
    }

    onChange(assetId) {
        this.chosen = assetId
    }

    // Only the date representation is kept: it is configuration the user may correct, prefilled from an asset chosen here.
    // An asset merely read again - the one REF opened with, or one switched back to - keeps the representation set for it,
    // and is prefilled only where none is, as where the form started unless the asset was edited. Whether the asset suits
    // the reference is the requirements' to judge, from the evidence the candidate's observation reads
    // (sourceCandidate.js).
    onLoaded({asset: assetId, metadata}) {
        const {inputs: {asset, dateFormat}} = this.props
        const prefill = metadata.properties?.dateFormat
        if (assetId === this.chosen) {
            dateFormat.set(prefill)
        } else if ([undefined, null, ''].includes(dateFormat.value)) {
            asset.isDirty() ? dateFormat.set(prefill) : dateFormat.setInitialValue(prefill)
        }
    }
}

export const AssetSection = compose(
    _AssetSection,
    connect()
)

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    labelButtons: PropTypes.array
}
