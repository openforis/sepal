import PropTypes from 'prop-types'
import React from 'react'
import {msg, Msg} from 'translate'
import {ErrorMessage, Input} from 'widget/form'

export default class AssetSection extends React.Component {
    render() {
        const {asset} = this.props
        // TODO: Make sure asset is readable
        return (
            <React.Fragment>
                <label><Msg id='process.classification.panel.source.form.asset.label'/></label>
                <Input
                    autoFocus
                    input={asset}
                    placeholder={msg(`process.classification.panel.source.form.asset.placeholder`)}
                    spellCheck={false}
                />
                <ErrorMessage for={asset}/>
            </React.Fragment>
        )
    }
}

AssetSection.propTypes = {
    asset: PropTypes.object.isRequired
}