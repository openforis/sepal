import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {isImageSource} from '~/app/home/body/process/recipeTypeRegistry'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'

import {updateLayerSource, withSourceValues} from './layerSourceEdit'
import styles from './selectRecipe.module.css'

const fields = {
    recipe: new Form.Field().notBlank()
}

// Opened with a `source` to edit, the form changes which recipe that source references, never the recipe itself.
class _SelectRecipe extends React.Component {
    state = {
        recipe: null
    }

    constructor(props) {
        super(props)
        this.add = this.add.bind(this)
        this.apply = this.apply.bind(this)
        this.onRecipeLoaded = this.onRecipeLoaded.bind(this)
    }

    render() {
        const {activatable: {deactivate, source}} = this.props
        return (
            <Panel
                className={styles.panel}
                placement='modal'
                onBackdropClick={deactivate}>
                <Panel.Header title={source
                    ? msg('map.layout.editImageLayerSource.types.Recipe.description')
                    : msg('map.layout.addImageLayerSource.types.Recipe.description')}/>
                <Panel.Content scrollable={false}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        {this.renderConfirmButton()}
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderConfirmButton() {
        const {activatable: {source}} = this.props
        const {recipe} = this.state
        return source
            ? <Panel.Buttons.Apply keybinding='Enter' onClick={this.apply} disabled={!recipe}/>
            : <Panel.Buttons.Add keybinding='Enter' onClick={this.add} disabled={!recipe}/>
    }

    // A saved source can reference a recipe in any project, so editing keeps showing it while only one is offered.
    renderContent() {
        const {inputs: {recipe}, activatable: {source}} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={isImageSource}
                allowOwnRecipe
                keepSelection={!!source}
                autoFocus
                onLoading={() => this.setState({recipe: null})}
                onRecipeLoaded={this.onRecipeLoaded}
            />
        )
    }

    onRecipeLoaded({recipe}) {
        const {activatable: {source}} = this.props
        if (recipe.id === source?.sourceConfig.recipeId) {
            this.sourceRecipeType = recipe.type
        }
        this.setState({recipe})
    }

    add() {
        const {recipe} = this.state
        const {recipeActionBuilder, activatable: {deactivate}} = this.props
        recipeActionBuilder('ADD_RECIPE_IMAGE_LAYER_SOURCE')
            .push('layers.additionalImageLayerSources', {
                id: uuid(),
                type: 'Recipe',
                sourceConfig: {
                    recipeId: recipe.id
                }
            })
            .dispatch()
        deactivate()
    }

    // An area's settings for a recipe layer belong to the recipe's type, so another type's recipe starts from its
    // own defaults; a recipe of the same type keeps them, for its layer to reconcile.
    apply() {
        const {recipe} = this.state
        const {recipeId, activatable: {deactivate, source}} = this.props
        const sameType = recipe.type === this.sourceRecipeType
        updateLayerSource({
            recipeId,
            sourceId: source.id,
            sourceConfig: {...source.sourceConfig, recipeId: recipe.id},
            reconcileLayerConfig: layerConfig => sameType ? layerConfig : undefined
        })
        deactivate()
    }
}

const sourceValues = source => ({
    recipe: source.sourceConfig.recipeId
})

const policy = () => ({
    _: 'allow'
})

export const SelectRecipe = compose(
    _SelectRecipe,
    withForm({fields}),
    withSourceValues(sourceValues),
    withRecipe(),
    withActivatable({id: 'selectRecipe', policy, alwaysAllow: true})
)
