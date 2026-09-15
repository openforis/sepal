import PropTypes from 'prop-types'
import React from 'react'
import {Subject} from 'rxjs'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

import {segmentsAssetDescription} from '../../../ccdc/segmentsAsset'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

class _AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        const {inputs: {asset, dateFormat}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    input={asset}
                    label={msg('process.changeAlerts.panel.reference.form.asset.label')}
                    placeholder={msg('process.changeAlerts.panel.reference.form.asset.placeholder')}
                    autoFocus
                    allowedTypes={['Image', 'ImageCollection']}
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

    // The asset is described by the shared segments adapter, and only the date representation is kept: it
    // is configuration the user may correct, prefilled from the asset. The description itself is the
    // source's and is read when it is needed.
    onLoaded({metadata}) {
        const {inputs: {asset, dateFormat}} = this.props
        const described = segmentsAssetDescription({
            bandNames: metadata.bands.map(({id}) => id),
            properties: metadata.properties
        })
        if (described.bands.length) {
            dateFormat.set(described.dateFormat)
        } else {
            asset.setInvalid(msg('process.changeAlerts.panel.reference.asset.notCcdc'))
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
