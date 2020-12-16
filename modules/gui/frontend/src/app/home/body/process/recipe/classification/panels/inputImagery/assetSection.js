import {Form} from 'widget/form/form'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export default class AssetSection extends React.Component {
    render() {
        const {input, onChange} = this.props
        return (
            <Form.Input
                label={msg('process.classification.panel.inputImagery.form.asset.label')}
                autoFocus
                input={input}
                placeholder={msg('process.classification.panel.inputImagery.form.asset.placeholder')}
                spellCheck={false}
                errorMessage
                onChangeDebounced={value => onChange(value)}
            />
        )
    }
}

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
