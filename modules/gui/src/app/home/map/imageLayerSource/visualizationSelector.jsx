import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {renderableVisualizations} from '~/app/home/body/process/recipe/visualizationMatching'
import {outputOwnedVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {getRecipeType} from '~/app/home/body/process/recipeTypeRegistry'
import {asFunctionalComponent} from '~/classComponent'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import {Button} from '~/widget/button'
import {Combo} from '~/widget/combo'
import {RemoveButton} from '~/widget/removeButton'

import {withMapArea} from '../mapAreaContext'
import {PresentationToggle} from './presentationToggle'

// A layer showing another recipe offers what that recipe owns. The record is already in the session - the
// layer source loaded it to show the image at all - so this reads it rather than keeping a copy.
const mapStateToProps = (state, {source}) => {
    const recipeId = source?.sourceConfig?.recipeId
    return {
        sourceRecipe: recipeId
            ? selectFrom(state, ['process.loadedRecipes', recipeId])
            : null
    }
}

const mapRecipeToProps = (recipe, {source}) => ({
    recipeId: recipe.id,
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
                buttons={selectedOption
                    // Palette, Legend and Values are projections of the visualization being shown. With no
                    // resolved option there is nothing being shown, so the toggle has nothing to toggle - and a
                    // stale selection is exactly that: a non-null visParams no option matches.
                    ? [<PresentationToggle key='presentation'/>]
                    : []}
                placeholder={'Select bands to visualize...'}
                options={options}
                value={selectedOption && selectedOption.value}
                onChange={({visParams}) => this.selectVisParams(visParams)}
            />
        )
    }

    getOptions() {
        const {userDefinedVisualizations, presetOptions} = this.props
        const inheritedOptions = this.toOptions(this.inheritedVisualizations())
        return [
            {
                label: msg('map.visualizationSelector.userDefined.label'),
                options: this.toOptions(userDefinedVisualizations)
            },
            ...(inheritedOptions.length
                ? [{label: msg('map.visualizationSelector.inherited.label'), options: inheritedOptions}]
                : []),
            ...presetOptions
        ]
    }

    // The styles the recipe being shown owns for its output. They are offered here and edited there: this
    // recipe holds no copy, so an edit or a deletion upstream reaches it, and the clone button is what makes
    // one of them into a style of its own. The recipe's own layer is excluded - there its styles are already
    // the editable ones above.
    //
    // A style this recipe already holds under the same identity is left to the local one. Copies made by
    // earlier versions share their upstream identity, and offering both puts two options with one value in
    // the list: whichever resolves first wins the selection, and the wrong one decides whether the style can
    // be edited. The saved copy is what a selection has been naming, so it keeps the identity; nothing is
    // deleted, and a style with no local copy is inherited as before.
    inheritedVisualizations() {
        const {sourceRecipe, recipeId, userDefinedVisualizations} = this.props
        if (!sourceRecipe || sourceRecipe.id === recipeId) {
            return []
        }
        const localIds = new Set(userDefinedVisualizations.map(({id}) => id))
        return outputOwnedVisualizations(sourceRecipe)
            .filter(({id}) => !localIds.has(id))
    }

    // One rule for every group. A style naming a band that is gone, or one an array band cannot render, is
    // withheld from the offer whoever owns it - the renderer would reject it either way, and offering it
    // puts a choice in the list the map cannot honour. Withheld, never deleted: it is offered again when the
    // band returns.
    toOptions(visualizations) {
        const availableBands = this.availableBands()
        const offered = availableBands
            ? renderableVisualizations(visualizations, availableBands)
            : visualizations
        return offered.map(visParams => ({
            value: visParams.id,
            label: visParams.bands.join(', '),
            visParams
        }))
    }

    // What the layer can draw. A caller that knows gives the band descriptions; one that gives only names
    // says nothing about dimensionality, and one that gives nothing leaves the recipe being shown to answer.
    // Unknown stays unknown - filtering against an empty schema would withhold everything.
    availableBands() {
        const {availableBands, sourceRecipe} = this.props
        if (_.isArray(availableBands)) {
            return Object.fromEntries(availableBands.map(band => [band, {}]))
        }
        if (_.isPlainObject(availableBands)) {
            return availableBands
        }
        return sourceRecipe
            ? getRecipeType(sourceRecipe.type)?.getAvailableBands(sourceRecipe)
            : undefined
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

    // The editor opens as a modal over the Map Area menu, so the menu is dismissed once the editor is up - the
    // order the Settings cog already uses: activate the destination first, then deactivate the menu. Selecting
    // and removing are not editor commands and leave the menu alone.
    openVisParams(activationProps) {
        const {activator: {activatables: {visParams, mapAreaMenu}}} = this.props
        visParams.activate(activationProps)
        mapAreaMenu.deactivate()
    }

    addVisParams() {
        const {recipe, source} = this.props
        this.openVisParams({recipe, imageLayerSourceId: source.id})
    }

    editVisParams(visParamsToEdit, editMode) {
        const {recipe, source} = this.props
        const visParams = editMode === 'clone'
            ? {...visParamsToEdit, id: uuid()}
            : visParamsToEdit
        this.openVisParams({recipe, imageLayerSourceId: source.id, visParams})
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
    connect(mapStateToProps),
    withRecipe(mapRecipeToProps),
    withActivators({
        visParams: ({mapArea: {area}}) => `visParams-${area}`,
        mapAreaMenu: ({mapArea: {area}}) => `mapAreaMenu-${area}`
    }),
    withMapArea(),
    asFunctionalComponent({
        presetOptions: []
    })
)

VisualizationSelector.propTypes = {
    source: PropTypes.any.isRequired,
    availableBands: PropTypes.oneOfType([PropTypes.array, PropTypes.object]),
    presetOptions: PropTypes.array,
    recipe: PropTypes.object
}
