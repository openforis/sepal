import PropTypes from 'prop-types'
import React from 'react'

import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Layout} from '~/widget/layout'

class _AssetSection extends React.Component {
    render() {
        const {inputs: {asset}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    input={asset}
                    label={msg('process.dias.panel.forestMask.form.asset.label')}
                    placeholder={msg('process.dias.panel.forestMask.form.asset.placeholder')}
                    tooltip={msg('process.dias.panel.forestMask.form.asset.tooltip')}
                    autoFocus
                    allowedTypes={['Image', 'ImageCollection']}
                />
            </Layout>
        )
    }
}

export const AssetSection = _AssetSection

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
