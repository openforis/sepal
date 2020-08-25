import React from 'react'
import {RecipeActions} from '../ccdcRecipe'
import styles from './chartPixel.module.css'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {withRecipe} from '../../recipeContext'
import {selectFrom} from 'stateUtils'
import {Layout} from '../../../../../../widget/layout'
import Keybinding from '../../../../../../widget/keybinding'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel')
})

class ChartPixel extends React.Component {
    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
    }

    render() {
        const {latLng} = this.props
        if (!latLng)
            return null
        else
            return this.renderPanel()
    }

    renderPanel() {
        const {latLng, action} = this.props
        const loading = !action('LOAD_CHART').dispatched
        return (
            <Panel
                className={styles.panel}
                type='center'>
                <Panel.Header
                    icon='chart-area'
                    title={`${latLng.lat}, ${latLng.lng}`}/>

                <Panel.Content className={loading ? styles.loading : null}
                               scrollable={false}
                               noVerticalPadding>
                    <Layout>
                        Contents
                    </Layout>
                </Panel.Content>

                <Panel.Buttons>
                    <Panel.Buttons.Main>
                        <Keybinding keymap={{'Escape': () => this.close()}}>
                            <Panel.Buttons.Close onClick={() => this.close()}/>
                        </Keybinding>
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    close() {
        this.recipeActions.setChartPixel(null)
    }
}

ChartPixel.propTypes = {}

export default compose(
    ChartPixel,
    withRecipe(mapRecipeToProps)
)
