import {Button} from 'widget/button'
import {LegendBuilder} from 'app/home/map/legendBuilder'
import {Panel} from 'widget/panel/panel'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withRecipe} from 'app/home/body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './legend.module.css'

const mapRecipeToProps = recipe => {
    const dataSets = selectFrom(recipe, 'model.trainingData').dataSets || []
    return ({
        hasTrainingData: !!dataSets.find(dataSet => dataSet.type !== 'COLLECTED' || !_.isEmpty(dataSet.referenceData)),
        importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries'),
        legendEntries: selectFrom(recipe, 'model.legend.entries') || []
    })
}

class _Legend extends React.Component {
    state = {
        bands: null,
        histograms: {},
        askConfirmation: false,
        legendEntries: [],
        invalidLegendEntries: false,
    }

    render() {
        const {activatable: {deactivate}} = this.props
        const {legendEntries, invalidLegendEntries} = this.state
        const invalid = invalidLegendEntries || !legendEntries.length
        return (
            <React.Fragment>
                <Panel
                    type='bottom-right'
                    className={styles.panel}>
                    <Panel.Header
                        icon='list'
                        title={msg('process.classification.panel.legend.title')}
                    />

                    <Panel.Content>
                        {this.renderContent()}
                    </Panel.Content>

                    <Panel.Buttons onEscape={deactivate} onEnter={() => invalid || this.save()}>
                        <Button
                            icon='file-import'
                            label={msg('map.legendBuilder.load.options.importFromCsv.label')}
                            onClick={() => this.importLegend()}/>

                        <Panel.Buttons.Main>
                            <Panel.Buttons.Cancel onClick={deactivate}/>
                            <Panel.Buttons.Apply
                                disabled={invalid}
                                onClick={() => this.save()}
                            />
                        </Panel.Buttons.Main>
                    </Panel.Buttons>
                </Panel>
            </React.Fragment>
        )
    }

    renderContent() {
        const {hasTrainingData} = this.props
        const {legendEntries} = this.state
        return (
            <LegendBuilder
                entries={legendEntries}
                locked={hasTrainingData}
                onChange={(updatedEntries, invalid) => this.updateLegendEntries(updatedEntries, invalid)}
            />
        )
    }

    componentDidMount() {
        const {legendEntries} = this.props
        this.setState({legendEntries})
    }

    componentDidUpdate() {
        const {importedLegendEntries, recipeActionBuilder} = this.props
        if (importedLegendEntries) {
            recipeActionBuilder('CLEAR_IMPORTED_LEGEND_ENTRIES', {importedLegendEntries})
                .del('ui.importedLegendEntries')
                .dispatch()
            this.setState({legendEntries: importedLegendEntries})
        }
    }

    updateLegendEntries(legendEntries, invalidLegendEntries) {
        this.setState({legendEntries, invalidLegendEntries})
    }

    importLegend() {
        const {activator: {activatables: {legendImport}}} = this.props
        legendImport.activate()
    }

    save() {
        const {dataCollectionManager, recipeActionBuilder, activatable: {deactivate}} = this.props
        const {legendEntries} = this.state
        recipeActionBuilder('SAVE_LEGEND_ENTRIES', {legendEntries})
            .set('model.legend.entries', legendEntries)
            .dispatch()
        setTimeout(() => // Ensure model is updated before updating data collection manager
            dataCollectionManager.updateAll()
        )
        deactivate()
    }
}
const policy = () => ({
    _: 'disallow',
    legendImport: 'allow'
})

export const Legend = compose(
    _Legend,
    withRecipe(mapRecipeToProps),
    activatable({id: 'legend', policy}),
    activator('legendImport')
)

Legend.propTypes = {
    dataCollectionManager: PropTypes.object.isRequired,
    recipeId: PropTypes.string,
}
