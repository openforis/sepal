import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {LegendBuilder, legendEntriesToModel} from '~/app/home/map/legendBuilder'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import styles from './legend.module.css'

const fields = {
    invalidEntries: new Form.Field()
        .predicate(invalid => !invalid, 'invalid'),
    entries: new Form.Field()
        .predicate((entries, {invalidEntries}) => !invalidEntries && entries.length, 'invalid')
}

// The transition legend, as each commit derives it (derivations.js): its labels and colours are the user's to edit.
const mapRecipeToProps = recipe => ({
    legendEntries: selectFrom(recipe, 'model.legend.entries') || []
})

class _Legend extends React.Component {
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

export const Legend = compose(
    _Legend,
    recipeFormPanel({id: 'legend', fields, mapRecipeToProps, valuesToModel})
)

Legend.propTypes = {
    recipeId: PropTypes.string
}
