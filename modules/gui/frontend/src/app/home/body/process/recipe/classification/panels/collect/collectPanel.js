import {Panel} from 'widget/panel/panel'
import {compose} from 'compose'
import PropTypes from 'prop-types'
import React from 'react'
import styles from './collectPanel.module.css'
import {selectFrom} from 'stateUtils'
import {withRecipe} from '../../../../recipeContext'
import {SuperButton} from 'widget/superButton'
import Keybinding from 'widget/keybinding'
import _ from 'lodash'
import {Subject} from 'rxjs'
import {takeUntil} from 'rxjs/operators'
import {hasTrainingData, RecipeActions} from '../../classificationRecipe'
import {msg} from 'translate'
import api from 'api'
import Icon from 'widget/icon'
import Notifications from 'widget/notifications'

const mapRecipeToProps = recipe => {
    return ({
        recipeId: recipe.id,
        legend: selectFrom(recipe, 'model.legend'),
        point: selectFrom(recipe, 'ui.collect.point'),
        lastValue: selectFrom(recipe, 'ui.collect.lastValue'),
        nextPoint: selectFrom(recipe, ['ui.collect.nextPoints', 0]),
        recipe
    })
}

class CollectPanel extends React.Component {
    state = {}
    close$ = new Subject()

    render() {
        const {point, stream} = this.props
        const loadingNextPoint = stream('LOAD_NEXT_POINTS').active
        if (!point && !loadingNextPoint) {
            return null
        }
        return (
            <Panel
                type='top-right'
                className={styles.panel}>
                <Panel.Header
                    icon='map-pin'
                    title={point
                        ? `${point.x}, ${point.y}`
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
                        : this.select({...point, 'class': legendEntry.value})}
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
                onEnter={() => this.next()}
                onEscape={() => this.close()}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close onClick={() => this.close()}/>
                    <Panel.Buttons.Next
                        onClick={() => this.next()}
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

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {point} = this.props
        const opened = point && point !== prevProps.point
        if (opened) {
            this.onOpen()
        }
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
                () => this.select({...point, 'class': lastValue})
            )
        } else {
            this.setState({value: null})
        }
    }

    select(point) {
        const update = _.isFinite(this.state.value)
        if (update) {
            this.update(point, this.state.value)
        } else {
            this.add(point)
        }
        this.setState({value: point['class']})
    }

    deselectValue(point) {
        const {recipeId, dataCollectionEvents} = this.props
        this.remove()
        RecipeActions(recipeId).unsetLastValue()
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

    next() {
        const {mapContext: {sepalMap}, recipe, stream, nextPoint, dataCollectionEvents} = this.props
        dataCollectionEvents.deselect(this.pointWithCurrentValue())
        const moveMap = point => sepalMap.fitBounds([[point.x, point.y], [point.x, point.y]])
        if (nextPoint) {
            RecipeActions(recipe.id).nextPointSelected()
            moveMap(nextPoint)
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
                    RecipeActions(recipe.id).setNextPoints(restOfPoints)
                    moveMap(nextPoint)
                    dataCollectionEvents.add(nextPoint)
                },
                error => Notifications.error({
                    message: msg('process.classification.collect.findingNextPoint.error', {error})
                })
            )
        }
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
    recipeId: PropTypes.string,
    dataCollectionEvents: PropTypes.object.isRequired
}

export default compose(
    CollectPanel,
    withRecipe(mapRecipeToProps)
)
