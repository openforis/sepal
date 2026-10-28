import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {classTransitions} from '#sepal/recipe/type/classChange'
import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {LegendBuilder, legendEntriesToModel} from '~/app/home/map/legendBuilder'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {Form} from '~/widget/form'
import {defaultColor} from '~/widget/form/colorInput'
import {Panel} from '~/widget/panel/panel'

import styles from './legend.module.css'

const fields = {
    invalidEntries: new Form.Field()
        .predicate(invalid => !invalid, 'invalid'),
    entries: new Form.Field()
        .predicate((entries, {invalidEntries}) => !invalidEntries && entries.length, 'invalid')
}

const mapRecipeToProps = recipe => {
    return ({
        toImage: selectFrom(recipe, 'model.toImage'),
        legendEntries: selectFrom(recipe, 'model.legend.entries') || [],
        fromImage: selectFrom(recipe, 'model.fromImage')
    })
}

class _Legend extends React.Component {
    render() {
        const {legendEntries} = this.props
        return <LegendPanel legendEntries={legendEntries}/>
    }

    componentDidUpdate(prevProps) {
        const {fromImage: prevFromImage, toImage: prevToImage} = prevProps
        const {fromImage, toImage} = this.props

        if (!_.isEqual([prevFromImage, prevToImage], [fromImage, toImage])) {
            this.updateLegend()
        }
    }

    updateLegend() {
        const {recipeId, fromImage, toImage} = this.props

        if (!fromImage || !toImage) {
            return
        }

        const entries = classTransitions(fromImage.legendEntries, toImage.legendEntries)
            .map(({value, from, to}) => ({
                id: uuid(),
                value,
                color: defaultColor(value),
                label: `${from.label} -> ${to.label}`
            }))
        const actionBuilder = recipeActionBuilder(recipeId)
        actionBuilder('UPDATE_LEGEND', {fromImage, toImage, entries})
            .set('model.legend.entries', entries)
            .dispatch()
    }
}

class _LegendPanel extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement="bottom-right">
                <Panel.Header
                    icon="list"
                    title={msg('process.classification.panel.legend.title')}
                />
                <Panel.Content scrollable={false}>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons/>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {entries}} = this.props
        return (
            <LegendBuilder
                entries={entries.value}
                locked={true}
                onChange={(updatedEntries, invalid) => this.updateLegendEntries(updatedEntries, invalid)}
            />
        )
    }

    componentDidMount() {
        const {legendEntries, inputs} = this.props
        inputs.entries.set(legendEntries)
    }

    // Whether the entries are valid is learned from them, not edited: it holds Apply back without making the form
    // dirty, which only a change to the entries does.
    updateLegendEntries(legendEntries, invalidLegendEntries) {
        const {inputs} = this.props
        inputs.entries.set(legendEntries)
        inputs.invalidEntries.setInitialValue(invalidLegendEntries)
    }
}

const valuesToModel = ({entries}) => ({
    entries: legendEntriesToModel(entries)
})

const LegendPanel = compose(
    _LegendPanel,
    recipeFormPanel({id: 'legend', fields, valuesToModel})
)

export const Legend = compose(
    _Legend,
    withRecipe(mapRecipeToProps)
)

Legend.propTypes = {
    recipeId: PropTypes.string
}
