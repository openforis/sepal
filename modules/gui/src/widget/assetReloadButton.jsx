import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {compose} from '~/compose'
import {msg} from '~/translate'
import {isServiceAccount} from '~/user'
import {withAssets} from '~/widget/assets'
import {Button} from '~/widget/button'

class _AssetReloadButton extends React.Component {
    constructor(props) {
        super(props)
        this.reloadAssets = this.reloadAssets.bind(this)

    }

    render() {
        const {shape, air, spin, assets: {busy, progress}} = this.props
        const reloadTooltip = busy
            ? msg('asset.reload.progress', {count: progress})
            : msg('asset.reload.tooltip')

        return (
            <Button
                key='reload'
                chromeless
                shape={shape}
                air={air}
                icon='rotate'
                iconAttributes={{spin: busy || spin}}
                tooltip={reloadTooltip}
                tooltipPlacement='top'
                tooltipVisible={progress ? true : undefined}
                tooltipAllowedWhenDisabled={progress}
                tabIndex={-1}
                disabled={isServiceAccount() || busy || spin}
                keybinding='Shift+R'
                onClick={this.reloadAssets}
            />
        )
    }

    reloadAssets() {
        const {assets: {reloadAssets}} = this.props
        reloadAssets()
    }

}

export const AssetReloadButton = compose(
    _AssetReloadButton,
    withAssets()
)

AssetReloadButton.propTypes = {
    air: PropTypes.any,
    shape: PropTypes.any,
    spin: PropTypes.any,
}
