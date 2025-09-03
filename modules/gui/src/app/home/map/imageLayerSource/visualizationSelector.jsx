import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {Combo} from '~/widget/combo'
import {RemoveButton} from '~/widget/removeButton'

import {withMapArea} from '../mapAreaContext'

const mapRecipeToProps = (recipe, {source}) => ({
    userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || []
})

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
                        chromeless
                        shape='circle'
                        size='small'
                        icon='plus'
                        tooltip={msg('map.visualizationSelector.add.tooltip')}
                        onClick={() => this.addVisParams()}
                    />,
                    <Button
                        key='edit'
                        chromeless
                        shape='circle'
                        size='small'
                        icon={editMode}
                        tooltip={msg(`map.visualizationSelector.${editMode}.tooltip`)}
                        disabled={!selectedOption}
                        onClick={() => this.editVisParams(selectedOption.visParams, editMode)}
                    />,
                    <RemoveButton
                        key='remove'
                        chromeless
                        shape='circle'
                        size='small'
                        tooltip={msg('map.visualizationSelector.remove.tooltip')}
                        disabled={!selectedOption || editMode === 'clone'}
                        onRemove={() => this.removeVisParams(selectedOption.visParams)}
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
        const {userDefinedVisualizations, presetOptions, availableBands} = this.props
        const userDefinedOptions = userDefinedVisualizations
            .filter(({bands}) => _.isUndefined(availableBands) || bands.every(band => availableBands.includes(band)))
            .map(visParams => ({
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
        const {mapArea: {updateLayerConfig}} = this.props
        updateLayerConfig({visParams})
    }

    addVisParams() {
        const {recipe, source, activator: {activatables: {visParams: {activate}}}} = this.props
        activate({recipe, imageLayerSourceId: source.id})
    }

    editVisParams(visParamsToEdit, editMode) {
        const {recipe, source, activator: {activatables: {visParams: {activate}}}} = this.props
        const visParams = editMode === 'clone'
            ? {...visParamsToEdit, id: uuid()}
            : visParamsToEdit
        activate({recipe, imageLayerSourceId: source.id, visParams})
    }

    removeVisParams(visParams) {
        const {source, recipeActionBuilder} = this.props
        recipeActionBuilder('REMOVE_VIS_PARAMS', {visParams})
            .del(['layers.userDefinedVisualizations', source.id, {id: visParams.id}])
            .dispatch()
        const options = this.flattenOptions(this.getOptions())
            .filter(({value}) => value !== visParams.id)
        this.selectVisParams(options.length
            ? options[0].visParams
            : null
        )
    }
}

export const VisualizationSelector = compose(
    _VisualizationSelector,
    withRecipe(mapRecipeToProps),
    withActivators({
        visParams: ({mapArea: {area}}) => `visParams-${area}`
    }),
    withMapArea(),
    asFunctionalComponent({
        presetOptions: []
    })
)

VisualizationSelector.propTypes = {
    source: PropTypes.any.isRequired,
    availableBands: PropTypes.array,
    presetOptions: PropTypes.array,
    recipe: PropTypes.object
}
