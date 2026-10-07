import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {Form} from '~/widget/form'

// Whether the asset holds statistics the alerts can monitor against is the requirement's to judge, from the typed bands
// the reference's observation reads (sourceRequirement.js).
export const AssetSection = ({inputs: {asset}, labelButtons}) =>
    <Form.AssetCombo
        input={asset}
        label={msg('process.baytsAlerts.panel.reference.form.asset.label')}
        labelButtons={labelButtons}
        placeholder={msg('process.baytsAlerts.panel.reference.form.asset.placeholder')}
        autoFocus
        allowedTypes={['Image', 'ImageCollection']}
    />

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    labelButtons: PropTypes.array
}
