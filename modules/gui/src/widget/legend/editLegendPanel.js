import {ButtonSelect} from '~/widget/buttonSelect'
import {Form} from '~/widget/form'
import {LegendBuilder, defaultColor} from '~/app/home/map/legendBuilder'
import {Notifications} from '~/widget/notifications'
import {Panel} from '~/widget/panel/panel'
import {compose} from '~/compose'
import {downloadCsv} from '../download'
import {msg} from '~/translate'
import {selectFrom} from '~/stateUtils'
import {uuid} from '~/uuid'
import {withActivatable} from '~/widget/activation/activatable'
import {withActivators} from '~/widget/activation/activator'
import {withForm} from '~/widget/form/form'
import {withMap} from '~/app/home/map/mapContext'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import React from 'react'
import _ from 'lodash'
import api from '~/apiRegistry'
import styles from './editLegendPanel.module.css'

const fields = {
    palette: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    importedLegendEntries: selectFrom(recipe, 'ui.importedLegendEntries')
})

class _EditLegendPanel extends React.Component {
    state = {
        legendEntries: [],
        invalidLegendEntries: false
    }

    constructor(props) {
        super(props)
        this.importLegend = this.importLegend.bind(this)
        this.loadDistinctBandValues = this.loadDistinctBandValues.bind(this)
        this.apply = this.apply.bind(this)
    }

    render() {
        const {activatable: {deactivate}, form} = this.props
        const {legendEntries, invalidLegendEntries} = this.state
        const invalid = form.isInvalid() || (invalidLegendEntries || !legendEntries.length)
        return (
            <Panel type='modal' className={styles.panel}>
                <Panel.Header
                    icon='layer-group'
                    title={msg('widget.legend.editLegendPanel.title')}
                />
                <Panel.Content scrollable={false}>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons>
                    {this.renderLegendBuilderButtons()}
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel
                            keybinding='Escape'
                            onClick={deactivate}
                        />
                        <Panel.Buttons.Apply
                            disabled={invalid}
                            keybinding='Enter'
                            onClick={this.apply}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderLegendBuilderButtons() {
        const {stream} = this.props
        const {legendEntries} = this.state
        const options = [
            {options: [
                {
                    value: 'import',
                    label: msg('map.legendBuilder.load.options.importFromCsv.label'),
                    onSelect: this.importLegend
                },
                {
                    value: 'imageValues',
                    label: msg('map.legendBuilder.load.options.imageValues.label'),
                    onSelect: this.loadDistinctBandValues
                }
            ]},
            {options: [
                {
                    value: 'export',
                    label: msg('map.legendBuilder.load.options.exportToCsv.label'),
                    disabled: !legendEntries || !legendEntries.length,
                    onSelect: () => this.exportLegend()
                }
            ]}
        ]
        return (
            <ButtonSelect
                look={'add'}
                icon={'plus'}
                label={msg('button.add')}
                placement='above'
                tooltipPlacement='bottom'
                options={options}
                disabled={stream('LOAD_DISTINCT_IMAGE_VALUES').active}
                onClick={() => this.addLegendEntry()}
            />
        )
    }

    renderContent() {
        const {legendEntries} = this.state
        return (
            <LegendBuilder
                entries={legendEntries}
                onChange={(updatedEntries, invalid) => this.updateLegendEntries(updatedEntries, invalid)}
            />
        )
    }

    componentDidMount() {
        const {activatable: {entries}} = this.props
        this.setState({legendEntries: entries})
    }

    componentDidUpdate(prevProps) {
        const {importedLegendEntries, recipeActionBuilder} = this.props
        if (importedLegendEntries && !_.isEqual(importedLegendEntries, prevProps.importedLegendEntries)) {
            recipeActionBuilder('CLEAR_IMPORTED_LEGEND_ENTRIES', {importedLegendEntries})
                .del('ui.importedLegendEntries')
                .dispatch()
            this.setState({legendEntries: importedLegendEntries})
        }
    }

    addLegendEntry() {
        this.setState(({legendEntries}) => {
            const max = _.maxBy(legendEntries, 'value')
            return {
                legendEntries: [...legendEntries, {
                    id: uuid(),
                    value: max ? max.value + 1 : 1,
                    color: defaultColor(legendEntries.length),
                    label: ''
                }]
            }
        })
    }

    updateLegendEntries(legendEntries, invalidLegendEntries) {
        this.setState({legendEntries, invalidLegendEntries})
    }

    importLegend() {
        const {activator: {activatables: {legendImport}}} = this.props
        legendImport.activate()
    }

    exportLegend() {
        const {legendEntries} = this.state
        const csv = [
            ['color,value,label'],
            legendEntries.map(({color, value, label}) => `${color},${value},"${label.replaceAll('"', '\\"')}"`)
        ].flat().join('\n')
        const filename = 'legend.csv'
        downloadCsv(csv, filename)
    }

    loadDistinctBandValues() {
        const {activatable: {band, recipe}, aoi, stream, map: {getBounds}} = this.props
        const toEntries = values => values.map(value => ({
            id: uuid(),
            value,
            label: `${value}`,
            color: '#000000'
        }))
        if (!stream('LOAD_DISTINCT_IMAGE_VALUES').active) {
            const mapBounds = getBounds()
            stream('LOAD_DISTINCT_IMAGE_VALUES',
                api.gee.distinctBandValues$({recipe, band, aoi, mapBounds}),
                values => this.setState({legendEntries: toEntries(values)}),
                () => Notifications.error({message: msg('map.legendBuilder.load.options.imageValues.loadError')})
            )
        }
    }

    apply() {
        const {recipeActionBuilder, activatable: {deactivate, statePath}} = this.props
        const {legendEntries} = this.state
        recipeActionBuilder('UPDATE_LEGEND_ENTRIES', {legendEntries})
            .set(statePath, legendEntries)
            .dispatch()
        deactivate()
    }
}

const policy = () => ({
    _: 'allow'
})

export const EditLegendPanel = compose(
    _EditLegendPanel,
    withForm({fields}),
    withRecipe(mapRecipeToProps),
    withMap(),
    withActivatable({
        id: 'editLegendPanel',
        policy,
        alwaysAllow: true
    }),
    withActivators('legendImport')
)
