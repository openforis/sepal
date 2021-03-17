import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Panel} from 'widget/panel/panel'
import {RecipeActions, hasTrainingData} from '../../classificationRecipe'
import {Subject} from 'rxjs'
import {SuperButton} from 'widget/superButton'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {takeUntil} from 'rxjs/operators'
import {withRecipe} from '../../../../recipeContext'
import Icon from 'widget/icon'
import Keybinding from 'widget/keybinding'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import styles from './collectPanel.module.css'

const mapRecipeToProps = recipe => {
    return ({
        recipeId: recipe.id,
        legend: selectFrom(recipe, 'model.legend'),
        point: selectFrom(recipe, 'ui.collect.point'),
        lastValue: selectFrom(recipe, 'ui.collect.lastValue'),
        nextPoint: selectFrom(recipe, ['ui.collect.nextPoints', 0]),
        history: selectFrom(recipe, 'ui.collect.history'),
        historyIndex: selectFrom(recipe, 'ui.collect.historyIndex'),
        recipe
    })
}

class CollectPanel extends React.Component {
    state = {}
    close$ = new Subject()

    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
    }

    render() {
        const {point, stream, history = []} = this.props
        const historyIndex = this.getHistoryIndex()
        const loadingNextPoint = stream('LOAD_NEXT_POINTS').active
        if (!point && !loadingNextPoint) {
            return null
        }
        const pointHeader = () =>
            <div className={styles.header}>
                <div className={styles.point}>
                    <div>{point.x}</div>
                    <div>{point.y}</div>
                </div>
                <ButtonGroup layout={'horizontal-nowrap'}>
                    <Button
                        icon={'chevron-left'}
                        shape={'none'}
                        disabled={historyIndex === 0 || history.length === 0}
                        onClick={() => this.previous()}
                    />
                    <Button
                        icon={'chevron-right'}
                        shape={'none'}
                        disabled={historyIndex >= history.length - 1 || historyIndex === -1}
                        onClick={() => this.next()}
                    />
                </ButtonGroup>
            </div>
        return (
            <Panel
                type='top-right'
                className={styles.panel}>
                <Panel.Header
                    icon='map-marker'
                    title={point
                        ? pointHeader()
                        : msg('process.classification.collect.findingNextPoint.title')}/>
                <Panel.Content className={styles.content}>
                    {loadingNextPoint
                        ? this.renderLoadingNextPoint()
                        : this.renderForm()}
                </Panel.Content>
                {this.renderButtons()}
            </Panel>
        )
    }

    renderForm() {
        const {legend} = this.props
        return legend.entries.map(entry => this.renderOption(entry))
    }

    renderOption(legendEntry) {
        const {point} = this.props
        return (
            <SuperButton
                key={legendEntry.value}
                className={this.isSelected(legendEntry) ? styles.selected : null}
                title={this.renderOptionTitle(legendEntry)}
                onClick={() =>
                    point['class'] === legendEntry.value
                        ? this.deselectValue({...point, 'class': null})
                        : this.selectValue({...point, 'class': legendEntry.value})}
            />
        )
    }

    renderOptionTitle({color, value, label}) {
        return (
            <div className={styles.legendEntry}>
                <div className={styles.color} style={{'--color': color}}/>
                <div className={styles.value}>{value}</div>
                <div className={styles.label}>{label}</div>
            </div>
        )
    }

    renderButtons() {
        const {stream, recipe} = this.props
        const loadingNextPoint = stream('LOAD_NEXT_POINTS').active
        return (
            <Panel.Buttons
                onEnter={() => this.findNext()}
                onEscape={() => this.close()}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close onClick={() => this.close()}/>
                    <Panel.Buttons.Next
                        onClick={() => this.findNext()}
                        disabled={!hasTrainingData(recipe) || loadingNextPoint}
                    />
                </Panel.Buttons.Main>
                <Keybinding keymap={{
                    Delete: () => this.remove(),
                    Backspace: () => this.remove()
                }}>
                    <Panel.Buttons.Remove
                        onClick={() => this.remove()}
                        disabled={loadingNextPoint}
                    />
                </Keybinding>
            </Panel.Buttons>
        )
    }

    renderLoadingNextPoint() {
        return (
            <div className={styles.loadingNextPoint}>
                <Icon name={'spinner'} size='2x'/>
            </div>
        )
    }

    componentDidUpdate(prevProps) {
        const {point} = this.props
        const opened = point && point !== prevProps.point
        if (opened) {
            this.onOpen()
        }
    }

    getHistoryIndex() {
        if (!this.props.point)
            return -1
        const {point, history = []} = this.props
        return history.findIndex(p => _.isEqual([p.x, p.y], [point.x, point.y]))
    }

    isSelected(legendEntry) {
        const {value} = this.state
        return value === legendEntry.value
    }

    onOpen() {
        const {point, lastValue} = this.props
        const edit = _.isFinite(point['class'])
        const newWithDefault = _.isFinite(lastValue)
        if (edit) {
            this.setState({value: point['class']})
        } else if (newWithDefault) {
            this.setState(
                {value: null},
                () => this.selectValue({...point, 'class': lastValue})
            )
        } else {
            this.setState({value: null})
        }
    }

    selectValue(point) {
        this.recipeActions.pushToHistory(point)
        const update = _.isFinite(this.state.value)
        if (update) {
            this.update(point, this.state.value)
        } else {
            this.add(point)
        }
        this.setState({value: point['class']})
    }

    deselectValue(point) {
        const {dataCollectionEvents} = this.props
        this.remove()
        this.recipeActions.unsetLastValue()
        setTimeout(() => dataCollectionEvents.add(point))
    }

    add(point) {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.update(point)
    }

    update(point, prevValue) {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.update(point, prevValue)
    }

    moveMap(point) {
        const {map} = this.props
        map.fitBounds([[point.x, point.y], [point.x, point.y]])
    }

    findNext() {
        const {recipe, stream, nextPoint, dataCollectionEvents} = this.props
        dataCollectionEvents.deselect(this.pointWithCurrentValue())
        if (nextPoint) {
            this.recipeActions.nextPointSelected()
            this.moveMap(nextPoint)
            dataCollectionEvents.add(nextPoint)
        } else {
            stream('LOAD_NEXT_POINTS',
                api.gee.nextReferenceDataPoints$(recipe).pipe(
                    takeUntil(this.close$)
                ),
                nextPoints => {
                    if (!nextPoints.length) {
                        Notifications.info({
                            message: msg('process.classification.collect.findingNextPoint.notFound')
                        })
                        return
                    }
                    const [nextPoint, ...restOfPoints] = nextPoints
                    this.recipeActions.setNextPoints(restOfPoints)
                    this.moveMap(nextPoint)
                    dataCollectionEvents.add(nextPoint)
                },
                error => Notifications.error({
                    message: msg('process.classification.collect.findingNextPoint.error', {error})
                })
            )
        }
    }

    next() {
        const {history, dataCollectionEvents} = this.props
        const historyIndex = this.getHistoryIndex()
        const updatedIndex = historyIndex + 1
        const point = history[updatedIndex]
        this.moveMap(point)
        dataCollectionEvents.select(point)
    }

    previous() {
        const {history, dataCollectionEvents} = this.props
        const historyIndex = this.getHistoryIndex()
        const updatedIndex = historyIndex === -1
            ? history.length - 1
            : historyIndex - 1
        const point = history[updatedIndex]
        this.moveMap(point)
        dataCollectionEvents.select(point)
    }

    close() {
        const {dataCollectionEvents, point} = this.props
        this.close$.next()
        if (point) {
            dataCollectionEvents.deselect(this.pointWithCurrentValue())
        }
    }

    remove() {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.remove(this.pointWithCurrentValue())
    }

    pointWithCurrentValue() {
        const {point} = this.props
        const {value} = this.state
        return {...point, 'class': value}
    }
}

CollectPanel.propTypes = {
    dataCollectionEvents: PropTypes.object.isRequired,
    recipeId: PropTypes.string,
}

export default compose(
    CollectPanel,
    withRecipe(mapRecipeToProps)
)
