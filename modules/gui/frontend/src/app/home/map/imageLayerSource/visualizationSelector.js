import {Button} from 'widget/button'
import {Combo} from 'widget/combo'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapAreaContext} from '../mapAreaContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import SafetyButton from 'widget/safetyButton'
import guid from 'guid'

const mapRecipeToProps = (recipe, ownProps) => {
    const {source} = ownProps
    return {
        userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
    }
}

class _VisualizationSelector extends React.Component {
    state = {}

    render() {
        const {selectedVisParams, presetOptions} = this.props
        const options = this.getOptions()
        const idMatch = selectedVisParams && selectedVisParams.id &&
            this.flattenOptions(options).find(option => option.value === selectedVisParams.id)
        const selectedOption = idMatch || (selectedVisParams &&
            this.flattenOptions(presetOptions).find(({visParams: {bands}}) =>
                bands.join(',') === selectedVisParams.bands.join(',')
            )
        )
        const editMode = selectedOption && selectedOption.visParams.userDefined ? 'edit' : 'clone'
        return (
            <Combo
                label={msg('map.visualizationSelector.label')}
                labelButtons={[
                    <Button
                        key='add'
                        tooltip={msg('map.visualizationSelector.add.tooltip')}
                        icon='plus'
                        chromeless
                        shape='circle'
                        size='small'
                        onClick={() => this.addVisParams()}
                    />,
                    <Button
                        key='edit'
                        tooltip={msg(`map.visualizationSelector.${editMode}.tooltip`)}
                        icon={editMode}
                        chromeless
                        shape='circle'
                        size='small'
                        disabled={!selectedOption}
                        onClick={() => this.editVisParams(selectedOption.visParams, editMode)}
                    />,
                    <SafetyButton
                        key='remove'
                        tooltip={msg('map.visualizationSelector.remove.tooltip')}
                        icon='trash'
                        chromeless
                        shape='circle'
                        size='small'
                        message={'Are you sure you want to remove these visualization parameters?'}
                        disabled={!selectedOption || editMode === 'clone'}
                        onConfirm={() => this.removeVisParams(selectedOption.visParams)}
                    />
                ]}
                placeholder={'Select bands to visualize...'}
                options={options}
                value={selectedOption && selectedOption.value}
                onChange={({visParams}) => this.selectVisParams(visParams)}
            />
        )
    }

    getOptions() {
        const {userDefinedVisualizations, presetOptions} = this.props
        const userDefinedOptions = userDefinedVisualizations.map(visParams => ({
            value: visParams.id,
            label: visParams.bands.join(', '),
            visParams
        }))
        return [
            {label: msg('map.visualizationSelector.userDefined.label'), options: userDefinedOptions},
            ...presetOptions
        ]
    }

    flattenOptions(options) {
        return options
            .map(option => option.options || [option])
            .flat()
    }

    selectVisParams(visParams) {
        const {mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams})
    }

    addVisParams() {
        const {recipe, source, activator: {activatables}, mapAreaContext: {area}} = this.props
        const visParamsPanel = activatables[`visParams-${area}`]
        visParamsPanel.activate({recipe, imageLayerSourceId: source.id})
    }

    editVisParams(visParamsToEdit, editMode) {
        const {recipe, source, activator: {activatables}, mapAreaContext: {area}} = this.props
        const visParamsPanel = activatables[`visParams-${area}`]
        const visParams = editMode === 'clone'
            ? {...visParamsToEdit, id: guid()}
            : visParamsToEdit
        visParamsPanel.activate({recipe, imageLayerSourceId: source.id, visParams})
    }

    removeVisParams(visParams) {
        const {source, recipeActionBuilder} = this.props
        recipeActionBuilder('REMOVE_VIS_PARAMS', {visParams})
            .del(['layers.userDefinedVisualizations', source.id, {id: visParams.id}])
            .dispatch()
        const options = this.flattenOptions(this.getOptions())
        this.selectVisParams(options.length
            ? options[0].visParams
            : null
        )
    }
}

export const VisualizationSelector = compose(
    _VisualizationSelector,
    withRecipe(mapRecipeToProps),
    activator(),
    withMapAreaContext()
)

VisualizationSelector.defaultProps = {
    presetOptions: []
}

VisualizationSelector.propTypes = {
    source: PropTypes.any.isRequired,
    presetOptions: PropTypes.array,
    recipe: PropTypes.object
}
