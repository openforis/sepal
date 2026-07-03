import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Icon} from '~/widget/icon'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../recipeContext'
import {loadLandTrendrSegments$, RecipeActions} from '../landTrendrRecipe'
import styles from './chartPixel.module.css'
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
        const {latLng, index} = this.props
        const {segments} = this.state
        const loading = !segments
        return (
            <Panel
                className={styles.panel}
                placement='center'>
                <Panel.Header
                    icon='chart-area'
                    title={`${latLng.lat}, ${latLng.lng}${index ? ` – ${index.toUpperCase()}` : ''}`}/>

                <Panel.Content
                    className={loading ? styles.loading : null}
                    scrollable={false}
                    noVerticalPadding>
                    {loading ? this.renderSpinner() : this.renderChart()}
                </Panel.Content>

                <Panel.Buttons>
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
        const {segments} = this.state
        const [years, raw, fitted, isVertex] = segments.LandTrendr || []
        if (!years || !years.length) {
            return (
                <div className={styles.noData}>
                    {msg('process.landTrendr.chartPixel.noData')}
                </div>
            )
        }
        return (
            <LandTrendrGraph
                years={years}
                raw={raw}
                fitted={fitted}
                isVertex={isVertex}
            />
        )
    }

    componentDidUpdate(prevProps) {
        const {recipe, latLng} = this.props
        if (latLng && (recipe.model !== prevProps.recipe.model || latLng !== prevProps.latLng)) {
            this.loadData()
        }
    }

    loadData() {
        const {stream, recipe, latLng} = this.props
        this.cancel$.next(true)
        this.setState({segments: undefined})
        stream('LOAD_LANDTRENDR_SEGMENTS',
            loadLandTrendrSegments$({recipe, latLng}).pipe(
                takeUntil(this.cancel$)
            ),
            segments => this.setState({segments}),
            error => {
                this.close()
                const errorMessage = error?.response?.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : error
                Notifications.error({
                    message: msg('process.landTrendr.chartPixel.loadSegments.error'),
                    error: errorMessage,
                    group: true,
                    timeout: 0
                })
            }
        )
    }

    close() {
        this.cancel$.next(true)
        this.setState({segments: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

export const ChartPixel = compose(
    _ChartPixel,
    withRecipe(mapRecipeToProps)
)

ChartPixel.propTypes = {}
