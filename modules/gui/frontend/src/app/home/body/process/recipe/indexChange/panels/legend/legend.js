import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {LegendBuilder, defaultColor} from 'app/home/map/legendBuilder'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import guid from 'guid'
import styles from './legend.module.css'

const fields = {
    invalidEntries: new Form.Field()
        .predicate(invalid => !invalid, 'invalid'),
    entries: new Form.Field()
        .predicate((entries, {invalidEntries}) => !invalidEntries && entries.length, 'invalid')
}

const mapRecipeToProps = recipe => ({
    importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
    legendEntries: selectFrom(recipe, 'model.legend.entries') || []
})

class _Legend extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}>
                <Panel.Header
                    icon='list'
                    title={msg('process.indexChange.panel.legend.title')}
                />

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons>
                    <Panel.Buttons.Add onClick={() => this.addEntry()}/>
                    <Button
                        icon='file-import'
                        label={msg('process.indexChange.panel.legend.import')}
                        onClick={() => this.importLegend()}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {inputs: {entries}} = this.props
        return (
            <LegendBuilder
                entries={entries.value}
                onChange={(updatedEntries, invalid) => this.updateLegendEntries(updatedEntries, invalid)}
            />
        )
    }

    componentDidMount() {
        const {legendEntries, inputs} = this.props
        inputs.entries.set(legendEntries)
    }

    componentDidUpdate() {
        const {inputs, importedLegendEntries, recipeActionBuilder} = this.props
        if (importedLegendEntries) {
            recipeActionBuilder('CLEAR_IMPORTED_LEGEND_ENTRIES', {importedLegendEntries})
                .del('ui.importedLegendEntries')
                .dispatch()
            inputs.entries.set(importedLegendEntries)
        }
    }

    addEntry() {
        const {inputs: {entries}} = this.props
        const id = guid()
        const max = _.maxBy(entries.value, 'value')
        const value = max ? max.value + 1 : 1
        const color = defaultColor(entries.value.length)
        const label = ''
        entries.set([...entries.value, {id, value, color, label}])
    }

    updateLegendEntries(legendEntries, invalidLegendEntries) {
        const {inputs} = this.props
        inputs.entries.set(legendEntries)
        inputs.invalidEntries.set(invalidLegendEntries)
    }

    importLegend() {
        const {activator: {activatables: {legendImport}}} = this.props
        legendImport.activate()
    }
}

const valuesToModel = ({entries}) => ({
    entries: _.sortBy(entries, 'value')
})

const additionalPolicy = () => ({
    _: 'disallow',
    legendImport: 'allow'
})

export const Legend = compose(
    _Legend,
    recipeFormPanel({id: 'legend', fields, mapRecipeToProps, additionalPolicy, valuesToModel}),
    activator('legendImport')
)

Legend.propTypes = {
    recipeId: PropTypes.string
}
