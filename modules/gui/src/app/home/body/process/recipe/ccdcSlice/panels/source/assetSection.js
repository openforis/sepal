import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

class AssetSection extends React.Component {
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
                    label={msg('process.ccdcSlice.panel.source.form.asset.label')}
                    placeholder={msg('process.ccdcSlice.panel.source.form.asset.placeholder')}
                    expectedType={['Image', 'ImageCollection']}
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

    onLoaded({metadata}) {
        const {inputs} = this.props
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
            dateFormat && inputs.dateFormat.set(dateFormat)
        } else {
            inputs.asset.setInvalid(msg('process.ccdcSlice.panel.source.asset.notCcdc'))
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
