import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {RecipeFormPanel, recipeFormPanel} from '~/app/home/body/process/recipeFormPanel'
import {defaultColor, LegendBuilder} from '~/app/home/map/legendBuilder'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {uuid} from '~/uuid'
import {withActivators} from '~/widget/activation/activator'
import {ButtonSelect} from '~/widget/buttonSelect'
import {downloadCsv} from '~/widget/download'
import {Form} from '~/widget/form'
import {Panel} from '~/widget/panel/panel'

import styles from './legend.module.css'

const fields = {
    invalidEntries: new Form.Field()
        .predicate(invalid => !invalid, 'invalid'),
    entries: new Form.Field()
        .predicate((entries, {invalidEntries}) => !invalidEntries && entries.length, 'invalid')
}

const mapRecipeToProps = recipe => ({
    importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
    legendEntries: selectFrom(recipe, 'model.legend.entries') || [],
    title: recipe.title || recipe.placeholder
})

class _Legend extends React.Component {
    render() {
        return (
            <RecipeFormPanel
                className={styles.panel}
                placement='bottom-right'>
                <Panel.Header
                    icon='list'
                    title={msg('process.indexChange.panel.legend.title')}
                />
                <Panel.Content scrollable={false}>
                    {this.renderContent()}
                </Panel.Content>
                <Form.PanelButtons>
                    {this.renderAddButton()}
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderAddButton() {
        const {inputs: {entries}} = this.props
        const options = [
            {
                value: 'import',
                label: msg('map.legendBuilder.load.options.importFromCsv.label'),
                onSelect: () => this.importLegend()
            },
            {
                value: 'export',
                label: msg('map.legendBuilder.load.options.exportToCsv.label'),
                disabled: !entries.value || !entries.value.length,
                onSelect: () => this.exportLegend()
            }
        ]
        return (
            <ButtonSelect
                look={'add'}
                icon={'plus'}
                label={msg('button.add')}
                placement='above'
                tooltipPlacement='bottom'
                options={options}
                onClick={() => this.addEntry()}
            />
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

    componentDidUpdate(prevProps) {
        const {inputs, importedLegendEntries, recipeActionBuilder} = this.props
        if (importedLegendEntries && !_.isEqual(importedLegendEntries, prevProps.importedLegendEntries)) {
            recipeActionBuilder('CLEAR_IMPORTED_LEGEND_ENTRIES', {importedLegendEntries})
                .del('ui.importedLegendEntries')
                .dispatch()
            inputs.entries.set(importedLegendEntries)
        }
    }

    addEntry() {
        const {inputs: {entries}} = this.props
        const id = uuid()
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

    exportLegend() {
        const {title, inputs: {entries}} = this.props
        const csv = [
            ['color,value,label'],
            entries.value.map(({color, value, label}) => `${color},${value},"${label.replaceAll('"', '\\"')}"`)
        ].flat().join('\n')
        const filename = `${title}_legend.csv`
        downloadCsv(csv, filename)
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
    withActivators('legendImport')
)

Legend.propTypes = {
    recipeId: PropTypes.string
}
