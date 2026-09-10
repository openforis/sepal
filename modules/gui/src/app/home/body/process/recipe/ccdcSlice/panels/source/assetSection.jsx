import _ from 'lodash'
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
        this.onLoaded = this.onLoaded.bind(this)
        // What the panel opens on has already been selected; only a move away from it is a new selection.
        this.state = {loadedAsset: props.inputs.asset.value}
    }

    render() {
        const {inputs: {asset, dateFormat}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    input={asset}
                    label={msg('process.ccdcSlice.panel.source.form.asset.label')}
                    placeholder={msg('process.ccdcSlice.panel.source.form.asset.placeholder')}
                    allowedTypes={['Image', 'ImageCollection']}
                    autoFocus
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

    // The date representation is configuration, with the asset's own property as its starting point. It is
    // taken from the property when THIS asset is first selected - zero is a value, not an absence - and left
    // alone afterwards: the user may have corrected it, and a later read of the same asset is not a reason
    // to undo that. A different asset starts over.
    onLoaded({asset, metadata}) {
        const {inputs} = this.props
        const {loadedAsset} = this.state
        // An answer about an asset the panel no longer names describes something nobody selected.
        if (asset !== inputs.asset.value) {
            return
        }
        const {bands, properties: {dateFormat}} = metadata
        const assetBands = _.intersection(...['coefs', 'magnitude', 'rmse']
            .map(postfix => bands
                .map(assetBand => {
                    return assetBand.id.match(`(.*)_${postfix}`)
                })
                .map(match => match && match[1])
                .filter(band => band)
            )
        )
        if (assetBands.length) {
            const newlySelected = loadedAsset !== asset
            const unconfigured = inputs.dateFormat.value === undefined || inputs.dateFormat.value === null
            if (dateFormat !== undefined && dateFormat !== null && (newlySelected || unconfigured)) {
                inputs.dateFormat.set(dateFormat)
            }
            this.setState({loadedAsset: asset})
        } else {
            inputs.asset.setInvalid(msg('process.ccdcSlice.panel.source.asset.notCcdc'))
        }
    }
}

export const AssetSection = compose(
    _AssetSection,
    connect()
)

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
