import {Button} from 'widget/button'
import {Combo} from 'widget/combo'
import {MapAreaLayout} from '../mapAreaLayout'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from '../mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import EarthEngineLayer from '../earthEngineLayer'
import PropTypes from 'prop-types'
import React from 'react'
import SafetyButton from 'widget/safetyButton'

const mapRecipeToProps = (recipe, ownProps) => {
    const {source} = ownProps
    return {
        visParamsSet: selectFrom(recipe, ['layers.customVisParams', source.id]) || []
    }
}

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
        const {visParamsSet, layerConfig: {visParams = {}} = {}} = this.props

        const options = visParamsSet.map(visParams => ({
            value: visParams.bands.join(', '),
            label: visParams.bands.join(', '),
            visParams
        }))
        const selectedOption = visParams && options.find(({visParams: {id}}) => visParams.id === id)
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
                    // TODO: If selected option is custom - edit button, otherwise clone button
                    <Button
                        key='edit'
                        // icon='clone'
                        icon='edit'
                        chromeless
                        shape='circle'
                        size='small'
                        disabled={!selectedOption}
                        onClick={() => this.editVisParams(selectedOption.visParams)}
                    />,
                    <SafetyButton
                        key='remove'
                        icon='trash'
                        chromeless
                        shape='circle'
                        size='small'
                        message={'Are you sure you want to remove these visualiation parameters?'}
                        // disabled={!selectedOption || !selectedOption.custom}
                        onConfirm={() => this.removeVisParams(selectedOption.visParams)}
                    />
                ]}
                additionalButtons={[
                ]}
                placeholder={'Select bands to visualize...'}
                options={options}
                value={selectedOption && selectedOption.value}
                onChange={({visParams}) => this.selectVisParams(visParams)}
            />
        )
    }

    selectVisParams(visParams) {
        const {mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams})
    }

    addVisParams() {
        const {source, activator: {activatables}, mapAreaContext: {area}} = this.props
        const visParamsPanel = activatables[`visParams-${area}`]
        const recipe = {
            type: 'ASSET',
            id: source.sourceConfig.asset
        }
        visParamsPanel.activate({recipe, imageLayerSourceId: source.id})
    }

    editVisParams(visParams) {
        const {source, activator: {activatables}, mapAreaContext: {area}} = this.props
        const visParamsPanel = activatables[`visParams-${area}`]
        const recipe = {
            type: 'ASSET',
            id: source.sourceConfig.asset
        }
        visParamsPanel.activate({recipe, imageLayerSourceId: source.id, visParams})
    }

    removeVisParams(visParams) {
        const {source, recipeActionBuilder} = this.props
        recipeActionBuilder('REMOVE_VIS_PARAMS', {visParams})
            .del(['layers.customVisParams', source.id, {id: visParams.id}])
            .dispatch()
    }

    getAsset() {
        const {source: {sourceConfig: {asset}}} = this.props
        return asset
    }
}

export const AssetImageLayerSource = compose(
    _AssetImageLayerSource,
    withRecipe(mapRecipeToProps),
    activator(), // TODO: Allow function to be passed, to dynamically select activatable(s)
    withMapAreaContext()
)

AssetImageLayerSource.propTypes = {
    source: PropTypes.any.isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object
}
