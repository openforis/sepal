import api from 'api'
import {compose} from 'compose'
import React from 'react'
import {connect} from 'store'
import {activatable} from 'widget/activation/activatable'
import {Panel, PanelButtons, PanelContent, PanelHeader} from 'widget/panel'
import styles from './fooRecipe.module.css'

class FooRecipe extends React.Component {
    state = {
        recipe: null
    }

    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <PanelHeader title='Foo recipe'/>
                <PanelContent>
                    {this.renderFooRecipe()}
                </PanelContent>
                <PanelButtons>
                    <PanelButtons.Main>
                        <PanelButtons.Close onClick={deactivate}/>
                    </PanelButtons.Main>
                </PanelButtons>
            </Panel>
        )
    }

    renderFooRecipe() {
        const {recipe} = this.state
        if (!recipe)
            return <div>Loading recipe...</div>
        return (
            <div>{recipe.title || recipe.placeholder}</div>
        )
    }

    componentDidMount() {
        const {activatable: {recipeId}} = this.props
        this.props.stream('LOAD_RECIPE', api.recipe.load$(recipeId),
            recipe => this.setState({recipe})
        )
    }
}

const policy = () => ({
    _: 'allow-then-deactivate'
})

export default compose(
    FooRecipe,
    connect(),
    activatable({id: 'fooRecipe', policy, alwaysAllow: true})
)
