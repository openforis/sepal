import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {recipeActionBuilder} from '~/app/home/body/process/recipe'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {defaultColor, LegendBuilder} from '~/app/home/map/legendBuilder'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {Form} from '~/widget/form'
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

        const entries = fromImage.legendEntries
            .map(({label: fromLabel}) =>
                toImage.legendEntries.map(({label: toLabel}) => {
                    return `${fromLabel} -> ${toLabel}`
                })
            )
            .flat()
            .map((label, i) => ({
                id: uuid(),
                value: i + 1,
                color: defaultColor(i + 1),
                label
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

    updateLegendEntries(legendEntries, invalidLegendEntries) {
        const {inputs} = this.props
        inputs.entries.set(legendEntries)
        inputs.invalidEntries.set(invalidLegendEntries)
    }
}

const valuesToModel = ({entries}) => ({
    entries: _.sortBy(entries, 'value')
})

const additionalPolicy = () => ({
    _: 'disallow'
})

const LegendPanel = compose(
    _LegendPanel,
    recipeFormPanel({id: 'legend', fields, additionalPolicy, valuesToModel})
)

export const Legend = compose(
    _Legend,
    withRecipe(mapRecipeToProps)
)

Legend.propTypes = {
    recipeId: PropTypes.string
}
