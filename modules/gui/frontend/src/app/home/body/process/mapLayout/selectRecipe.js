import {Panel} from 'widget/panel/panel'
import {RecipeList} from '../recipeList/recipeList'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect, select} from 'store'
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
                    <Panel.Header title='Add Sepal recipe'/>
                    <Panel.Content scrollable={false}>
                        <RecipeList.Data onSelect={recipeId => this.selectRecipe(recipeId)}/>
                    </Panel.Content>
                    <Panel.Buttons>
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
        recipeActionBuilder('ADD_LAYER')
            .push('map.layers', {
                id: uuid(),
                type: 'SEPAL_RECIPE',
                recipeId
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
    withRecipe(() => ({})),
    activatable({id: 'selectRecipe', policy}),
    connect(mapStateToProps)
)
