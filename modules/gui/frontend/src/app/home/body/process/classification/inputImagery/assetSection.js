import {Input} from 'widget/input'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export default class AssetSection extends React.Component {
    render() {
        const {input, onChange} = this.props
        return (
            <Input
                label={msg('process.classification.panel.inputImagery.form.asset.label')}
                autoFocus
                input={input}
                placeholder={msg('process.classification.panel.inputImagery.form.asset.placeholder')}
                spellCheck={false}
                errorMessage
                onBlur={e => onChange(e.target.value)}
            />
        )
    }
}

AssetSection.propTypes = {
    input: PropTypes.object.isRequired
}
