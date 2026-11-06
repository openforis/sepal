import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../recipeContext'
import {ChartPixelPanelHeader} from '../../chartPixelPanelHeader'
import {exportableChart, PixelChartExport} from '../../pixelChartExport'
import {loadLandTrendrSegments$, RecipeActions} from '../landTrendrRecipe'
import styles from './chartPixel.module.css'
import {landTrendrChart, landTrendrExportRecords} from './landTrendrChart'
import {LandTrendrGraph} from './landTrendrGraph'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    index: selectFrom(recipe, 'model.sources.index'),
    recipe
})

class _ChartPixel extends React.Component {
    cancel$ = new Subject()
    state = {}

    constructor(props) {
        super(props)
        this.recipeActions = RecipeActions(props.recipeId)
        this.close = this.close.bind(this)
    }

    render() {
        const {latLng} = this.props
        if (!latLng) {
            return null
        }
        return this.renderPanel()
    }

    renderPanel() {
        const {recipe, latLng, index} = this.props
        const {chart} = this.state
        const loading = !chart
        return (
            <Panel
                className={styles.panel}
                placement='center'>
                <ChartPixelPanelHeader
                    latLng={latLng}
                    suffix={index ? index.toUpperCase() : null}/>

                <Panel.Content
                    className={loading ? styles.loading : null}
                    scrollable={false}
                    noVerticalPadding>
                    <form className={styles.form}>
                        {loading ? this.renderSpinner() : this.renderChart()}
                    </form>
                </Panel.Content>

                <Panel.Buttons>
                    <PixelChartExport
                        recipe={recipe}
                        chart={exportableChart(chart, {band: index, latLng})}
                        records={landTrendrExportRecords}
                    />
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Close
                            keybinding='Escape'
                            onClick={this.close}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderSpinner() {
        return (
            <div className={styles.spinner}>
                <Icon name='spinner' size='2x'/>
            </div>
        )
    }

    renderChart() {
        const {chart} = this.state
        if (chart.empty) {
            return (
                <div className={styles.noData}>
                    {msg('process.landTrendr.chartPixel.noData')}
                </div>
            )
        }
        return (
            <LandTrendrGraph chart={chart}/>
        )
    }

    componentDidUpdate(prevProps) {
        const {recipe, latLng} = this.props
        if (latLng && (recipe.model !== prevProps.recipe.model || latLng !== prevProps.latLng)) {
            this.loadData()
        }
    }

    // What is read is charted as read for the recipe's index at this pixel.
    loadData() {
        const {stream, recipe, latLng, index} = this.props
        this.cancel$.next(true)
        this.setState({chart: undefined})
        stream('LOAD_LANDTRENDR_SEGMENTS',
            loadLandTrendrSegments$({recipe, latLng}).pipe(
                takeUntil(this.cancel$)
            ),
            segments => this.setState({chart: landTrendrChart({band: index, latLng, segments})}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.landTrendr.chartPixel.loadSegments.error'),
                    error: toUserErrorMessage(error),
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    close() {
        this.cancel$.next(true)
        this.setState({chart: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

export const ChartPixel = compose(
    _ChartPixel,
    withRecipe(mapRecipeToProps)
)

ChartPixel.propTypes = {}
