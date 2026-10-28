import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {connect} from '~/connect'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {withFormContext} from '~/widget/form/context'
import {Layout} from '~/widget/layout'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

class _AssetSection extends React.Component {
    render() {
        const {form, labelButtons, inputs: {asset, dateFormat}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    input={asset}
                    label={msg('process.changeAlerts.panel.reference.form.asset.label')}
                    labelButtons={labelButtons}
                    placeholder={msg('process.changeAlerts.panel.reference.form.asset.placeholder')}
                    autoFocus
                    allowedTypes={['Image', 'ImageCollection']}
                />
                <Form.Buttons
                    label={msg('process.ccdc.panel.dates.form.dateFormat.label')}
                    input={dateFormat}
                    errorMessage={form.getErrorMessage(dateFormat)}
                    disabled={!asset.value}
                    {...dateFormat.presentation?.(msg('process.ccdc.panel.dates.form.dateFormat.label'))}
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

}

export const AssetSection = compose(
    _AssetSection,
    connect(),
    withFormContext()
)

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    labelButtons: PropTypes.array
}
