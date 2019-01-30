import {Input} from 'widget/form'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'
import {isMobile} from 'widget/userAgent'

export default class AssetSection extends React.Component {
    render() {
        const {asset} = this.props
        // TODO: Make sure asset is readable
        return (
            <Input
                label={msg('process.changeDetection.panel.source.form.asset.label')}
                autoFocus={!isMobile()}
                input={asset}
                placeholder={msg('process.changeDetection.panel.source.form.asset.placeholder')}
                spellCheck={false}
                errorMessage
            />
        )
    }
}

AssetSection.propTypes = {
    asset: PropTypes.object.isRequired
}
