import React from 'react'
import {RecipeActions, loadCCDCTimeSeries$} from '../ccdcRecipe'
import styles from './chartPixel.module.css'
import {tap} from 'rxjs/operators'
import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import {withRecipe} from '../../recipeContext'
import {selectFrom} from 'stateUtils'
import {Layout} from '../../../../../../widget/layout'
import Keybinding from '../../../../../../widget/keybinding'
import _ from 'lodash'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    recipe
})

class ChartPixel extends React.Component {
    constructor(props) {
        super(props)
        this.stat = {chart: null}
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
        const {latLng, stream} = this.props
        const loading = !stream('LOAD_CHART').completed
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
                        {loading ? this.renderSpinner() : this.renderChart()}
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

    renderSpinner() {
        return <div>Spinner</div>
    }

    renderChart() {
        const {timeSeries} = this.state
        console.log(timeSeries)
        return <div>{JSON.stringify(timeSeries)}</div>
    }


    componentDidUpdate(prevProps, prevState, snapshot) {
        const {recipe, latLng} = this.props
        if (latLng && !_.isEqual([recipe.model, latLng], [prevProps.recipe.model, prevProps.latLng])) {
            console.log('Loading chart')
            this.props.stream('LOAD_CHART',
                loadCCDCTimeSeries$({recipe, latLng}).pipe(
                    tap(timeSeries => this.setState({timeSeries}))
                )
            )
        }
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
