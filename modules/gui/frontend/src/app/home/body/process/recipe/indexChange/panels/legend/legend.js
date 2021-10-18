import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {LegendBuilder, defaultColor} from './legendBuilder'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from 'app/home/body/process/recipeFormPanel'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {recipeActionBuilder} from 'app/home/body/process/recipe'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
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

const mapRecipeToProps = recipe => {
    return ({
        toImage: selectFrom(recipe, 'model.toImage'),
        importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
        legendEntries: selectFrom(recipe, 'model.legend.entries') || [],
        fromImage: selectFrom(recipe, 'model.fromImage')
    })
}

class _Legend extends React.Component {
    render() {
        const {importedLegendEntries, legendEntries} = this.props
        return <LegendPanel
            importedLegendEntries={importedLegendEntries}
            legendEntries={legendEntries}
        />
    }
}

class _LegendPanel extends React.Component {
    state = {colorMode: 'palette'}

    render() {
        const {colorMode} = this.state
        const title = (
            <div className={styles.title}>
                <div>{msg('process.classification.panel.legend.title')}</div>
                <Button
                    chromeless
                    size='small'
                    icon={colorMode === 'palette' ? 'font' : 'palette'}
                    tooltip={msg(colorMode === 'palette'
                        ? 'map.legendBuilder.colors.text.tooltip'
                        : 'map.legendBuilder.colors.colorPicker.tooltip')}
                    onClick={() => this.toggleColorMode()}
                />
            </div>
        )
        return (
            <RecipeFormPanel
                placement="bottom-right"
                className={styles.panel}>
                <Panel.Header
                    icon="list"
                    title={title}
                />
                <Panel.Content>
                    <Layout spacing='compact'>
                        {this.renderContent()}
                    </Layout>
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
        const {colorMode} = this.state
        return (
            <LegendBuilder
                entries={entries.value}
                colorMode={colorMode}
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

    toggleColorMode() {
        this.setState(({colorMode}) => ({colorMode: colorMode === 'palette' ? 'text' : 'palette'}))
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

const LegendPanel = compose(
    _LegendPanel,
    recipeFormPanel({id: 'legend', fields, additionalPolicy, valuesToModel}),
    activator('legendImport')
)

export const Legend = compose(
    _Legend,
    withRecipe(mapRecipeToProps)
)

Legend.propTypes = {
    recipeId: PropTypes.string
}
