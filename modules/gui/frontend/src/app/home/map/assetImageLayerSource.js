import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Combo} from 'widget/combo'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from './mapAreaLayout'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import EarthEngineLayer from './earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './assetImageLayerSource.module.css'

class _AssetImageLayerSource extends React.Component {
    state = {}

    render() {
        const {output} = this.props
        switch(output) {
        case 'DESCRIPTION': return this.renderDescription()
        case 'LAYER': return this.renderLayer()
        default: throw Error(`Unsupported output type: ${output}`)
        }
    }

    renderDescription() {
        return <div>{this.getAsset()}</div>
    }

    renderLayer() {
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
        const bandsLabel = (
            <Layout type={'horizontal-nowrap'} className={styles.bandsLabel}>
                <div>Bands</div>
                <ButtonGroup spacing='tight'>
                    <Button
                        icon='plus'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => this.addVisParams()}
                    />
                    <Button
                        icon='clone'
                        // icon='edit'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => console.log('remove')}
                    />
                    <Button
                        icon='trash'
                        chromeless
                        shape='circle'
                        size='small'
                        disabled
                        onClick={() => console.log('remove')}
                    />
                </ButtonGroup>
            </Layout>
        )
        return (
            <Combo
                label={bandsLabel}
                placeholder={'Select bands to visualize...'}
                options={[]}
            />
        )
    }

    addVisParams() {
        const {source, activator: {activatables: {visParams}}} = this.props
        visParams.activate({source})
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
    output: PropTypes.oneOf(['LAYER', 'DESCRIPTION']).isRequired,
    source: PropTypes.any.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
