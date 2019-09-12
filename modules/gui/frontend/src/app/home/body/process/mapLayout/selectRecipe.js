import {Panel} from 'widget/panel/panel'
import {RecipeList} from '../recipeList/recipeList'
import {activatable} from 'widget/activation/activatable'
// import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {connect, select} from 'store'
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
        console.log({recipeId})
        // const {activator: {activatables: {fooRecipe}}} = this.props
        // fooRecipe.activate({recipeId: recipeId})
    }
}

const policy = () => ({
    _: 'allow-then-deactivate'
})

export const SelectRecipe = compose(
    _SelectRecipe,
    activatable({id: 'selectRecipe', policy, alwaysAllow: false}),
    // activator('fooRecipe'),
    connect(mapStateToProps)
)
