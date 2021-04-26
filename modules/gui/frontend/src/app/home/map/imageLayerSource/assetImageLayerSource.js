import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from '../mapAreaLayout'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from '../../../../translate'
import EarthEngineLayer from '../earthEngineLayer'
import Notifications from '../../../../widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './assetImageLayerSource.module.css'

class _AssetImageLayerSource extends React.Component {
    state = {}

    render() {
        const {layerConfig, map} = this.props
        const asset = this.getAsset()
        const layer = map
            ? EarthEngineLayer.fromAsset({asset, layerConfig, map})
            : null

        return (
            <MapAreaLayout
                layer={layer}
                form={this.renderImageLayerForm()}
                map={map}
            />
        )
    }

    // TODO: Parts of this should be reusable. All recipe layer sources should render the bands

    renderImageLayerForm() {
        return (
            <Combo
                label={'Bands'}
                labelButtons={[
                    <Button
                        key='add'
                        icon='plus'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => this.addVisParams()}
                    />,
                    <Button
                        key='clone'
                        icon='clone'
                        // icon='edit'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => console.log('remove')}
                    />,
                    <Button
                        key='remove'
                        icon='trash'
                        chromeless
                        shape='circle'
                        size='small'
                        disabled
                        onClick={() => console.log('remove')}
                    />
                ]}
                placeholder={'Select bands to visualize...'}
                options={[]}
            />
        )
    }

    addVisParams() {
        const {source, activator: {activatables: {visParams}}} = this.props
        const recipe = {
            type: 'ASSET',
            id: source.sourceConfig.asset
        }
        visParams.activate({recipe})
    }

    getAsset() {
        const {source: {sourceConfig: {asset}}} = this.props
        return asset
    }
}

export const AssetImageLayerSource = compose(
    _AssetImageLayerSource,
    activator('visParams')
)

AssetImageLayerSource.propTypes = {
    source: PropTypes.any.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
