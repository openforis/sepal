import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {compose} from 'compose'
import {connect} from 'store'
import React from 'react'
import api from 'api'
import styles from './fooRecipe.module.css'

class FooRecipe extends React.Component {
    state = {
        recipe: null
    }

    render() {
        const {activatable: {deactivate}} = this.props
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header title='Foo recipe'/>
                <Panel.Content>
                    {this.renderFooRecipe()}
                </Panel.Content>
                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close onClick={deactivate}/>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
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
