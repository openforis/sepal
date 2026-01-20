import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'
import {Subject, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {withMap} from '~/app/home/map/mapContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Button} from '~/widget/button'
import {ButtonGroup} from '~/widget/buttonGroup'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'
import {LegendItem} from '~/widget/legend/legendItem'
import {ListItem} from '~/widget/listItem'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'

import {hasTrainingData, RecipeActions} from '../../classificationRecipe'
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

class _CollectPanel extends React.Component {
    state = {}
    close$ = new Subject()

    constructor(props) {
        super(props)
        const {recipeId} = props
        this.recipeActions = RecipeActions(recipeId)
        this.findNext = this.findNext.bind(this)
        this.close = this.close.bind(this)
        this.remove = this.remove.bind(this)
        this.previous = this.previous.bind(this)
        this.next = this.next.bind(this)
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
                        icon='chevron-left'
                        shape='circle'
                        disabled={historyIndex === 0 || history.length === 0}
                        onClick={this.previous}
                    />
                    <Button
                        icon='chevron-right'
                        shape='circle'
                        disabled={historyIndex >= history.length - 1 || historyIndex === -1}
                        onClick={this.next}
                    />
                </ButtonGroup>
            </div>
        return (
            <Panel
                className={styles.panel}
                placement='top-right'>
                <Panel.Header
                    icon='map-marker'
                    title={point
                        ? pointHeader()
                        : msg('process.classification.collect.findingNextPoint.title')}/>
                <Panel.Content>
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
        return (
            <Layout type='vertical' spacing='tight'>
                {legend.entries.map(entry => this.renderOption(entry))}
            </Layout>
        )
    }

    renderOption(legendEntry) {
        const {point} = this.props
        const {color, value, label} = legendEntry
        const onClick = () =>
            point['class'] === legendEntry.value
                ? this.deselectValue({...point, 'class': null})
                : this.selectValue({...point, 'class': legendEntry.value})
        return (
            <ListItem
                key={legendEntry.value}
                onClick={onClick}
            >
                <LegendItem
                    color={color}
                    value={value}
                    label={label}
                    selected={this.isSelected(legendEntry)}
                    onClick={onClick}
                />
            </ListItem>
        )
    }

    renderButtons() {
        const {stream, recipe} = this.props
        const loadingNextPoint = stream('LOAD_NEXT_POINTS').active
        return (
            <Panel.Buttons>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close
                        keybinding='Escape'
                        onClick={this.close}
                    />
                    <Panel.Buttons.Next
                        disabled={!hasTrainingData(recipe) || loadingNextPoint}
                        keybinding='Enter'
                        onClick={this.findNext}
                    />
                </Panel.Buttons.Main>
                <Panel.Buttons.Remove
                    disabled={loadingNextPoint}
                    keybinding={['Delete', 'Backspace']}
                    onClick={this.remove}
                />
            </Panel.Buttons>
        )
    }

    renderLoadingNextPoint() {
        return (
            <div className={styles.loadingNextPoint}>
                <Icon name='spinner' size='2x'/>
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
        const {dataCollectionManager} = this.props
        this.remove()
        this.recipeActions.unsetLastValue()
        setTimeout(() => dataCollectionManager.add(point))
    }

    add(point) {
        const {dataCollectionManager} = this.props
        setTimeout(() => dataCollectionManager.update(point))
    }

    update(point, prevValue) {
        const {dataCollectionManager} = this.props
        setTimeout(() => dataCollectionManager.update(point, prevValue))
    }

    // moveMap(point) {
    //     const {map} = this.props
    //     const {google} = map.getGoogle()
    //     const center = new google.maps.core.LatLng(point.y, point.x)
    //     map.setView({center, zoom: 16})
    // }

    moveMap({x: lng, y: lat}) {
        const {map} = this.props
        map.setView({center: {lat, lng}, zoom: 16})
    }

    findNext() {
        const {recipe, stream, nextPoint, dataCollectionManager} = this.props
        dataCollectionManager.deselect(this.pointWithCurrentValue())
        if (nextPoint) {
            this.recipeActions.nextPointSelected()
            this.moveMap(nextPoint)
            dataCollectionManager.add(nextPoint)
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
                    dataCollectionManager.add(nextPoint)
                },
                error => Notifications.error({
                    message: msg('process.classification.collect.findingNextPoint.error', {error})
                })
            )
        }
    }

    next() {
        const {history, dataCollectionManager} = this.props
        const historyIndex = this.getHistoryIndex()
        const updatedIndex = historyIndex + 1
        const point = history[updatedIndex]
        this.moveMap(point)
        dataCollectionManager.select(point)
    }

    previous() {
        const {history, dataCollectionManager} = this.props
        const historyIndex = this.getHistoryIndex()
        const updatedIndex = historyIndex === -1
            ? history.length - 1
            : historyIndex - 1
        const point = history[updatedIndex]
        this.moveMap(point)
        dataCollectionManager.select(point)
    }

    close() {
        const {dataCollectionManager, point} = this.props
        this.close$.next()
        if (point) {
            dataCollectionManager.deselect(this.pointWithCurrentValue())
        }
    }

    remove() {
        const {dataCollectionManager} = this.props
        dataCollectionManager.remove(this.pointWithCurrentValue())
    }

    pointWithCurrentValue() {
        const {point} = this.props
        const {value} = this.state
        return {...point, 'class': value}
    }
}

export const CollectPanel = compose(
    _CollectPanel,
    withRecipe(mapRecipeToProps),
    withMap()
)

CollectPanel.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired,
    recipeId: PropTypes.string,
}
