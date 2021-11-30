import {Panel} from 'widget/panel/panel'
import {RecipeList} from '../recipeList/recipeList'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect, select} from 'store'
import {msg} from 'translate'
import {v4 as uuid} from 'uuid'
import {withRecipe} from 'app/home/body/process/recipeContext'
import React from 'react'
import styles from './selectRecipe.module.css'

const mapStateToProps = () => {
    return {
        recipes: select('process.recipes')
    }
}

class _SelectRecipe extends React.Component {
    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <RecipeList>
                <Panel type='modal' className={styles.panel}>
                    <Panel.Header title={msg('map.layout.addImageLayerSource.types.Recipe.description')}/>
                    <Panel.Content scrollable={false}>
                        <RecipeList.Data onSelect={recipeId => this.selectRecipe(recipeId)}/>
                    </Panel.Content>
                    <Panel.Buttons onEscape={deactivate}>
                        <Panel.Buttons.Main>
                            <Panel.Buttons.Close onClick={deactivate}/>
                        </Panel.Buttons.Main>
                        <Panel.Buttons.Extra>
                            <RecipeList.Pagination/>
                        </Panel.Buttons.Extra>
                    </Panel.Buttons>
                </Panel>
            </RecipeList>
        )
    }

    selectRecipe(recipeId) {
        const {recipeActionBuilder, activatable: {deactivate}} = this.props
        recipeActionBuilder('ADD_RECIPE_IMAGE_LAYER_SOURCE')
            .push('layers.additionalImageLayerSources', {
                id: uuid(),
                type: 'Recipe',
                sourceConfig: {
                    recipeId
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
    withRecipe(),
    activatable({id: 'selectRecipe', policy, alwaysAllow: true}),
    connect(mapStateToProps)
)
