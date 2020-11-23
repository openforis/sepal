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

const mapRecipeToProps = recipe => {
    return ({
        recipeId: recipe.id,
        legend: selectFrom(recipe, 'model.legend'),
        point: selectFrom(recipe, 'ui.collect.point'),
        lastValue: selectFrom(recipe, 'ui.collect.lastValue')
    })
}

class CollectPanel extends React.Component {
    state = {}

    render() {
        const {point} = this.props
        if (!point) {
            return null
        }
        return (
            <Panel
                type='top-right'
                className={styles.panel}>
                <Panel.Header
                    icon='check'
                    title={`${point.x}, ${point.y}`}/>
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                {this.renderButtons()}
            </Panel>
        )
    }

    renderContent() {
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
                onClick={() => this.select({...point, 'class': legendEntry.value})}
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
        return (
            <Panel.Buttons
                onEnter={() => this.next()}
                onEscape={() => this.close()}>
                <Panel.Buttons.Main>
                    <Panel.Buttons.Close onClick={() => this.close()}/>
                    <Panel.Buttons.Next onClick={() => this.next()}/>
                </Panel.Buttons.Main>
                <Keybinding keymap={{
                    Delete: () => this.remove(),
                    Backspace: () => this.remove()
                }}>
                    <Panel.Buttons.Remove onClick={() => this.remove()}/>
                </Keybinding>
            </Panel.Buttons>
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
            this.update(point)
        } else {
            this.add(point)
        }
        this.setState({value: point['class']})
    }

    add(point) {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.update(point)
    }

    update(point) {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.update(point)
    }

    next() {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.deselect(this.pointWithCurrentValue())
    }

    close() {
        const {dataCollectionEvents} = this.props
        dataCollectionEvents.deselect(this.pointWithCurrentValue())
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
