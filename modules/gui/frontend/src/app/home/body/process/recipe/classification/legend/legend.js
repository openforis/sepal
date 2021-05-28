import {Button} from 'widget/button'
import {Form} from 'widget/form/form'
import {LegendBuilder} from 'app/home/map/legendBuilder'
import {Panel} from 'widget/panel/panel'
import {RecipeFormPanel, recipeFormPanel} from '../../../recipeFormPanel'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './legend.module.css'

const fields = {
    invalidEntries: new Form.Field(),
    entries: new Form.Field()
        .predicate((entries, {invalidEntries}) => !invalidEntries && entries.length)
}

const mapRecipeToProps = recipe => {
    const dataSets = selectFrom(recipe, 'model.trainingData').dataSets || []
    return ({
        hasTrainingData: !!dataSets.find(dataSet => dataSet.type !== 'COLLECTED' || !_.isEmpty(dataSet.referenceData)),
        importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
        legendEntries: selectFrom(recipe, 'model.legend.entries') || []
    })
}

class _Legend extends React.Component {
    render() {
        const {dataCollectionManager} = this.props
        return (
            <RecipeFormPanel
                placement='bottom-right'
                className={styles.panel}
                onApply={() => setTimeout(() => setTimeout(() => dataCollectionManager.updateAll()))}>
                <Panel.Header
                    icon='list'
                    title={msg('process.classification.panel.legend.title')}
                />

                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>

                <Form.PanelButtons>
                    <Button
                        icon='file-import'
                        label={msg('map.legendBuilder.load.options.importFromCsv.label')}
                        onClick={() => this.importLegend()}/>
                </Form.PanelButtons>
            </RecipeFormPanel>
        )
    }

    renderContent() {
        const {hasTrainingData, inputs: {entries}} = this.props
        return (
            <LegendBuilder
                entries={entries.value}
                locked={hasTrainingData}
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
const additionalPolicy = () => ({
    _: 'disallow',
    legendImport: 'allow'
})

export const Legend = compose(
    _Legend,
    recipeFormPanel({id: 'legend', fields, mapRecipeToProps, additionalPolicy}),
    activator('legendImport')
)

Legend.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired,
    recipeId: PropTypes.string,
}
