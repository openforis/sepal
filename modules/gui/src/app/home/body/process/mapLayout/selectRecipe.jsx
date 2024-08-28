import React from 'react'

import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Panel} from '~/widget/panel/panel'
import {RecipeInput} from '~/widget/recipeInput'

import styles from './selectRecipe.module.css'

const fields = {
    recipe: new Form.Field().notBlank()
}

class _SelectRecipe extends React.Component {
    state = {
        recipe: null
    }

    constructor(props) {
        super(props)
        this.add = this.add.bind(this)
    }

    render() {
        const {recipe} = this.state
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title={msg('map.layout.addImageLayerSource.types.Recipe.description')}/>
                <Panel.Content scrollable={false}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        <Panel.Buttons.Add
                            keybinding='Enter'
                            onClick={this.add}
                            disabled={!recipe}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderContent() {
        const {inputs: {recipe}} = this.props
        return (
            <RecipeInput
                input={recipe}
                filter={type => !type.noImageOutput}
                autoFocus
                onLoading={() => this.setState({recipe: null})}
                onLoaded={({recipe}) => this.setState({recipe})}
            />
        )
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
}

const policy = () => ({
    _: 'allow'
})

export const SelectRecipe = compose(
    _SelectRecipe,
    withForm({fields}),
    withRecipe(),
    withActivatable({id: 'selectRecipe', policy, alwaysAllow: true})
)
