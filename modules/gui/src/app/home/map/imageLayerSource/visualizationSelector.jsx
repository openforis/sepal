import PropTypes from 'prop-types'
import React from 'react'

import {productArgs} from '~/app/home/body/process/recipe/recipeOutput'
import {renderableBandNames, renderableVisualizations} from '~/app/home/body/process/recipe/visualizationMatching'
import {inheritedVisualizations} from '~/app/home/body/process/recipe/visualizations'
import {withRecipe} from '~/app/home/body/process/recipeContext'
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

// The layer this selector styles is the one its area shows, and that layer's config names the product it shows.
const mapRecipeToProps = (recipe, {source, mapArea}) => ({
    recipeId: recipe.id,
    userDefinedVisualizations: selectFrom(recipe, ['layers.userDefinedVisualizations', source.id]) || [],
    areaLayerConfig: selectFrom(recipe, ['layers.areas', mapArea?.area, 'imageLayer', 'layerConfig']) || {}
})

class _VisualizationSelector extends React.Component {
    state = {}

    render() {
        const {selectedVisParams, labelButtons = []} = this.props
        const options = this.getOptions()
        const idMatch = selectedVisParams && selectedVisParams.id &&
            this.flattenOptions(options).find(option => option.value === selectedVisParams.id)
        const selectedOption = idMatch || (selectedVisParams && !selectedVisParams.id
            ? this.flattenOptions(this.presetOptions()).find(({visParams: {bands}}) =>
                bands.join(',') === selectedVisParams.bands.join(',')
            )
            : undefined
        )
        const editMode = selectedOption && selectedOption.visParams.userDefined ? 'edit' : 'clone'
        const editorContext = this.editorContext()
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
                        disabled={!editorContext}
                        onClick={() => this.addVisParams(editorContext)}
                    />,
                    <Button
                        key='edit'
                        chromeless
                        shape='circle'
                        size='small'
                        icon={editMode}
                        tooltip={msg(`map.visualizationSelector.${editMode}.tooltip`)}
                        disabled={!selectedOption || !editorContext}
                        onClick={() => this.editVisParams(editorContext, selectedOption.visParams, editMode)}
                    />,
                    <RemoveButton
                        key='remove'
                        chromeless
                        shape='circle'
                        size='small'
                        tooltip={msg('map.visualizationSelector.remove.tooltip')}
                        disabled={!selectedOption || editMode === 'clone'}
                        onRemove={() => this.removeVisParams(selectedOption.visParams)}
                    />,
                    ...labelButtons
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
        const {userDefinedVisualizations} = this.props
        const inheritedOptions = this.toOptions(this.inheritedVisualizations())
        return [
            {
                label: msg('map.visualizationSelector.userDefined.label'),
                options: this.toOptions(userDefinedVisualizations)
            },
            ...(inheritedOptions.length
                ? [{label: msg('map.visualizationSelector.inherited.label'), options: inheritedOptions}]
                : []),
            ...this.presetOptions()
        ]
    }

    presetOptions() {
        const availableBands = this.availableBands()
        const filter = options => options.flatMap(option => option.options
            ? [{...option, options: filter(option.options)}]
            : renderableVisualizations([option.visParams], availableBands).length
                ? [option]
                : [])
        return filter(this.props.presetOptions)
    }

    // The styles the recipe being shown owns for its output. They are offered here and edited there: this
    // recipe holds no copy, so an edit or a deletion upstream reaches it, and the clone button is what makes
    // one of them into a style of its own.
    inheritedVisualizations() {
        const {sourceRecipe, recipeId, userDefinedVisualizations} = this.props
        return inheritedVisualizations({sourceRecipe, recipeId, userDefinedVisualizations})
    }

    // One rule for every group. A style naming a band that is gone, or one an array band cannot render, is
    // withheld from the offer whoever owns it - the renderer would reject it either way, and offering it
    // puts a choice in the list the map cannot honour. Withheld, never deleted: it is offered again when the
    // band returns.
    toOptions(visualizations) {
        return renderableVisualizations(visualizations, this.availableBands()).map(visParams => ({
            value: visParams.id,
            label: visParams.bands.join(', '),
            visParams
        }))
    }

    // What the layer can draw, as the layer that owns the answer gives it: band descriptions whose dimensionality decides
    // what can be drawn. Nothing given is nothing to draw.
    availableBands() {
        return this.props.availableBands || {}
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

    // What the editor works from, captured together when it opens: the recipe, the bands this layer's answer holds
    // and the arguments naming the product it shows. The editor asks nothing about bands itself, so it opens only
    // once they are known.
    editorContext() {
        const {recipe, source, areaLayerConfig} = this.props
        const bands = renderableBandNames(this.availableBands())
        return bands.length
            ? {recipe, imageLayerSourceId: source.id, bands, productArgs: productArgs(recipe, areaLayerConfig)}
            : null
    }

    addVisParams(editorContext) {
        this.openVisParams(editorContext)
    }

    editVisParams(editorContext, visParamsToEdit, editMode) {
        const visParams = editMode === 'clone'
            ? {...visParamsToEdit, id: uuid()}
            : visParamsToEdit
        this.openVisParams({...editorContext, visParams})
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
    availableBands: PropTypes.object,
    presetOptions: PropTypes.array,
    labelButtons: PropTypes.array,
    recipe: PropTypes.object
}
