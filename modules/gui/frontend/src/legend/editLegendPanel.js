import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {Form, form} from 'widget/form/form'
import {Layout} from 'widget/layout'
import {LegendBuilder, defaultColor} from 'app/home/map/legendBuilder'
import {Panel} from 'widget/panel/panel'
import {Widget} from 'widget/widget'
import {activatable} from 'widget/activation/activatable'
import {activator} from 'widget/activation/activator'
import {compose} from 'compose'
import {msg} from 'translate'
import {selectFrom} from 'stateUtils'
import {withMapContext} from 'app/home/map/mapContext'
import {withRecipe} from 'app/home/body/process/recipeContext'
import ButtonSelect from 'widget/buttonSelect'
import Notifications from 'widget/notifications'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import guid from 'guid'
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
        invalidLegendEntries: false,
        colorMode: 'palette'
    }

    constructor(props) {
        super(props)
        this.importLegend = this.importLegend.bind(this)
        this.loadDistinctBandValues = this.loadDistinctBandValues.bind(this)
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
                <Panel.Content>
                    {this.renderContent()}
                </Panel.Content>
                <Panel.Buttons onEscape={deactivate} onEnter={() => invalid || this.apply()}>
                    {this.renderLegendBuilderButtons()}
                    <Panel.Buttons.Main>
                        <Panel.Buttons.Cancel onClick={deactivate}/>
                        <Panel.Buttons.Apply
                            disabled={invalid}
                            onClick={() => this.apply()}
                        />
                    </Panel.Buttons.Main>
                </Panel.Buttons>
            </Panel>
        )
    }

    renderLegendBuilderButtons() {
        const {stream} = this.props
        const options = [
            {
                value: 'import',
                label: msg('map.legendBuilder.load.options.importFromCsv.label'),
                onSelect: this.importLegend
            },
            {
                value: 'imageValues',
                label: msg('map.legendBuilder.load.options.imageValues.label'),
                onSelect: this.loadDistinctBandValues
            },
        ]
        return (
            <ButtonGroup>
                <Panel.Buttons.Add onClick={() => this.addLegendEntry()}/>
                <ButtonSelect
                    label={msg('map.legendBuilder.load.label')}
                    icon={stream('LOAD_DISTINCT_IMAGE_VALUES').active ? 'spinner' : 'file-import'}
                    placement='above'
                    tooltipPlacement='bottom'
                    options={options}
                    disabled={stream('LOAD_DISTINCT_IMAGE_VALUES').active}
                    onSelect={option => option && _.find(options, ({value}) => value === option.value).onSelect()}
                />
            </ButtonGroup>
        )
    }

    renderContent() {
        const {colorMode, legendEntries} = this.state
        return (
            <Layout>
                <Widget label={msg('map.legendBuilder.label')} labelButtons={this.renderLabelButtons()}>
                    <LegendBuilder
                        entries={legendEntries}
                        colorMode={colorMode}
                        onChange={(updatedEntries, invalid) => this.updateLegendEntries(updatedEntries, invalid)}
                        className={styles.legendBuilder}
                    />
                </Widget>
            </Layout>
        )
    }

    renderLabelButtons() {
        const {colorMode} = this.state
        return [
            <Button
                key={'colorMode'}
                chromeless
                size='small'
                shape='circle'
                icon={colorMode === 'palette' ? 'font' : 'palette'}
                tooltip={msg(colorMode === 'palette'
                    ? 'map.legendBuilder.colors.text.tooltip'
                    : 'map.legendBuilder.colors.colorPicker.tooltip')}
                onClick={() => this.toggleColorMode()}
            />
        ]
    }

    toggleColorMode() {
        this.setState(({colorMode}) => ({colorMode: colorMode === 'palette' ? 'text' : 'palette'}))
    }

    componentDidMount() {
        const {activatable: {entries}} = this.props
        this.setState({legendEntries: entries})
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

    addLegendEntry() {
        this.setState(({legendEntries}) => {
            const max = _.maxBy(legendEntries, 'value')
            return {
                legendEntries: [...legendEntries, {
                    id: guid(),
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

    loadDistinctBandValues() {
        const {activatable: {band, recipe}, aoi, stream, mapContext: {map: {getBounds}}} = this.props
        const toEntries = values => values.map(value => ({
            id: guid(),
            value,
            label: value,
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
    form({fields}),
    withRecipe(mapRecipeToProps),
    withMapContext(),
    activatable({
        id: 'editLegendPanel',
        policy,
        alwaysAllow: true
    }),
    activator('legendImport')
)
