import moment from 'moment'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {toUserErrorMessage} from '~/userError'
import {Icon} from '~/widget/icon'
import {NoData} from '~/widget/noData'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {withRecipe} from '../../../../recipeContext'
import {ChartPixelPanelHeader} from '../../../chartPixelPanelHeader'
import {loadObservations$, RecipeActions} from '../../diasRecipe'
import styles from './chartPixel.module.css'
import {DiasGraph} from './diasGraph'

const DATE_FORMAT = 'YYYY-MM-DD'

const mapRecipeToProps = recipe => ({
    recipeId: recipe.id,
    latLng: selectFrom(recipe, 'ui.chartPixel'),
    startDate: moment(selectFrom(recipe, 'model.dates.startDate'), DATE_FORMAT).toDate(),
    endDate: moment(selectFrom(recipe, 'model.dates.endDate'), DATE_FORMAT).toDate(),
    threshold: selectFrom(recipe, 'model.diasOptions.threshold'),
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
        const {latLng} = this.props
        const {result} = this.state
        return (
            <Panel
                className={styles.panel}
                placement='center'>
                <ChartPixelPanelHeader latLng={latLng} suffix='DI'/>

                <Panel.Content
                    scrollable={false}
                    noVerticalPadding>
                    <form className={styles.form}>
                        {result ? this.renderChart() : this.renderSpinner()}
                    </form>
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
        const {startDate, endDate, threshold} = this.props
        const {result: {observations, alert}} = this.state
        if (!observations.length) {
            return <NoData message={msg('process.dias.chartPixel.noData')}/>
        }
        return (
            <>
                {alert?.forest_mask ? null : (
                    <div className={styles.notForest}>
                        {msg('process.dias.chartPixel.notForest')}
                    </div>
                )}
                <DiasGraph
                    observations={observations}
                    alert={alert}
                    threshold={threshold}
                    startDate={startDate}
                    endDate={endDate}
                />
            </>
        )
    }

    componentDidUpdate(prevProps) {
        const {recipe, latLng} = this.props
        if (latLng && (recipe.model !== prevProps.recipe.model || latLng !== prevProps.latLng)) {
            this.loadData()
        }
    }

    componentWillUnmount() {
        this.cancel$.next(true)
        this.cancel$.complete()
    }

    loadData() {
        const {stream, recipe, latLng} = this.props
        this.cancel$.next(true)
        this.setState({result: undefined})
        stream('LOAD_DIAS_OBSERVATIONS',
            loadObservations$({recipe, latLng}).pipe(
                takeUntil(this.cancel$)
            ),
            result => this.setState({result}),
            error => {
                this.close()
                Notifications.error({
                    message: msg('process.dias.chartPixel.loadObservations.error'),
                    error: toUserErrorMessage(error)
                })
            }
        )
    }

    close() {
        this.cancel$.next(true)
        this.setState({result: undefined})
        this.recipeActions.setChartPixel(null)
    }
}

export const ChartPixel = compose(
    _ChartPixel,
    withRecipe(mapRecipeToProps)
)

ChartPixel.propTypes = {}
