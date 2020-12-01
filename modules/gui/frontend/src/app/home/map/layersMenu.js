import {Form, form} from 'widget/form/form'
import {Menu} from 'widget/menu/menu'
import {activatable} from 'widget/activation/activatable'
import {changeBaseLayer} from './baseLayer'
import {compose} from 'compose'
import {msg} from 'translate'
import {select} from 'store'
import ButtonSelect from 'widget/buttonSelect'
import Labels from './labels'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from 'action-builder'
import moment from 'moment'
import styles from './layersMenu.module.css'

const fields = {
    dateRange: new Form.Field(),
    proc: new Form.Field()
}

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    baseLayer: select([ownProps.statePath, 'baseLayer']),
    mapOverlayIndex: select([ownProps.statePath, 'mapOverlayIndex']),
    featureOverlayIds: select([ownProps.statePath, 'featureOverlayIds']),
    dateRange: select([ownProps.statePath, 'mapLayer.dateRange']),
    proc: select([ownProps.statePath, 'mapLayer.proc'])
})

class _LayersMenu extends React.Component {
    render() {
        const {
            inputs: {dateRange, proc},
            activatable: {deactivate},
            labelsShown, baseLayer, labelLayerIndex, statePath, mapContext
        } = this.props
        const mapOverlayOptions = this.getMapOverlays().map(layer =>
            <Menu.Option
                key={layer.layerIndex}
                id={layer.layerIndex}
                label={layer.label}
                description={layer.description}/>)
        const featureOverlayOptions = this.getFeatureOverlayIds().map(layer =>
            <Menu.Option
                key={layer.id}
                id={layer.id}
                label={layer.label}
                description={layer.description}/>)
        const {dateRangeOptions, procOptions} = this.getPlanetDateOptions()

        const procOption = procOptions.find(({value}) => proc.value === value)
        const dateRangeOption = dateRangeOptions.find(({value}) => dateRange.value === value)
        return (
            <Menu
                position='top-right'
                className={styles.panel}
                close={deactivate}>
                <Menu.Select
                    id={'BASE_LAYER'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.baseLayer')}
                    onSelect={type => this.changeBaseLayer(type, dateRange, proc)}
                    // onSelect={type => this.changeBaseLayer(type, year, month, proc)}
                    selected={baseLayer || 'SEPAL'}>
                    <Menu.Option
                        id={'SEPAL'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.SEPAL.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.SEPAL.description')}/>
                    <Menu.Option
                        id={'GOOGLE_SATELLITE'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.GOOGLE_SATELLITE.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.GOOGLE_SATELLITE.description')}/>
                    <Menu.Option
                        id={'PLANET'}
                        label={msg('process.mosaic.mapToolbar.layersMenu.PLANET.label')}
                        description={msg('process.mosaic.mapToolbar.layersMenu.PLANET.description')}
                        right={
                            <div className={styles.layerOptions}>
                                <ButtonSelect
                                    placement='below'
                                    alignment='left'
                                    input={proc}
                                    tooltipPlacement='bottom'
                                    options={procOptions}
                                    label={procOption && procOption.label}
                                    onSelect={proc => this.changeBaseLayer('PLANET', this.props.inputs.dateRange, proc)}
                                />
                                <ButtonSelect
                                    placement='below'
                                    alignment='left'
                                    input={dateRange}
                                    tooltipPlacement='bottom'
                                    options={dateRangeOptions}
                                    label={dateRangeOption && dateRangeOption.label}
                                    onSelect={dateRange => this.changeBaseLayer('PLANET', dateRange, this.props.inputs.proc)}
                                />
                            </div>
                        }/>
                </Menu.Select>
                <Menu.Separator/>
                <Menu.Select
                    id={'MAP_OVERLAYS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.overlay')}
                    onSelect={selectedOverlayIndex => this.toggleMapOverlay(selectedOverlayIndex)}
                    selected={this.selectedMapOverlayIndex()}>
                    {mapOverlayOptions}
                </Menu.Select>
                <Menu.Select
                    id={'FEATURE_OVERLAYS'}
                    onSelect={selectedOverlayId => this.toggleFeatureOverlay(selectedOverlayId)}
                    selected={this.selectedFeatureOverlayIds()}>
                    {featureOverlayOptions}
                </Menu.Select>
                <Menu.Toggle
                    id={'SHOW_LABELS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.labels.label')}
                    description={msg('process.mosaic.mapToolbar.layersMenu.labels.description')}
                    selected={labelsShown}
                    onChange={shown =>
                        Labels.showLabelsAction({
                            mapContext,
                            shown,
                            layerIndex: labelLayerIndex,
                            statePath
                        }).dispatch()}/>
            </Menu>
        )
    }

    componentDidUpdate() {
        const {dateRange: prevDateRange, proc: prevProc, inputs: {dateRange, proc}} = this.props
        if (!proc.value)
            proc.set(prevProc || 'rgb')
        if (!dateRange.value)
            dateRange.set(prevDateRange || moment().subtract(2, 'months').format('YYYY-MM'))
    }

    getPlanetDateOptions() {
        const startDate = moment('2020-09-01')
        const endDate = moment().subtract(1, 'months')
        const months = endDate.diff(startDate, 'months')
        const monthlyOptions = sequence(0, months).map(monthDelta => {
            const date = moment(startDate).add(monthDelta, 'months')
            return {
                value: date.format('YYYY-MM'),
                label: `${date.format('MMM YYYY')} (1 month)`
            }
        })

        const procOptions = [
            {value: 'rgb', label: 'RGB'},
            {value: 'cir', label: 'CIR'},
        ]
        const dateRangeOptions = [
            {value: '2018-12_2019-05', label: 'Dec 2018 (6 months)'},
            {value: '2019-06_2019-11', label: 'Jun 2019 (6 months)'},
            {value: '2019-12_2020-05', label: 'Dec 2019 (6 months)'},
            {value: '2020-06_2020-08', label: 'Jun 2020 (3 months)'},
            ...monthlyOptions
        ]
        return {procOptions, dateRangeOptions}
    }

    changeBaseLayer(type, dateRange, proc) {
        const {statePath, mapContext} = this.props
        const planetApiKey = mapContext.norwayPlanetApiKey
        changeBaseLayer({
            type,
            mapContext,
            statePath,
            options: {dateRange: dateRange.value, proc: proc.value, planetApiKey}
        })
    }

    getMapOverlays() {
        const {mapContext: {sepalMap}} = this.props
        return sepalMap.toggleableLayers()
            .filter(({layerIndex}) => layerIndex !== undefined)
    }

    selectedMapOverlayIndex() {
        const {mapOverlayIndex} = this.props
        if (mapOverlayIndex === undefined) {
            const overlays = this.getMapOverlays()
            return overlays.length
                ? overlays.map(layer => layer.layerIndex)[0]
                : -1
        } else {
            return mapOverlayIndex
        }
    }

    toggleMapOverlay = selectedOverlayIndex => {
        const {statePath} = this.props
        const mapOverlays = this.getMapOverlays()

        const prevOverlayIndex = this.selectedMapOverlayIndex()
        if (selectedOverlayIndex !== prevOverlayIndex) {
            const prevOverlay = mapOverlays.find(layer => layer.layerIndex === prevOverlayIndex)
            prevOverlay && prevOverlay.hide(true)
        }

        const selectedOverlay = mapOverlays.find(layer => layer.layerIndex === selectedOverlayIndex)
        const hide = prevOverlayIndex === selectedOverlayIndex
        selectedOverlay && selectedOverlay.hide(hide)
        const nextOverlayIndex = hide ? -1 : selectedOverlayIndex

        actionBuilder('SET_MAP_OVERLAY', {nextOverlayIndex})
            .set([statePath, 'mapOverlayIndex'], nextOverlayIndex)
            .build()
            .dispatch()
    }

    getFeatureOverlayIds() {
        const {mapContext: {sepalMap}} = this.props
        return sepalMap.toggleableLayers()
            .filter(({layerIndex}) => layerIndex === undefined)
    }

    selectedFeatureOverlayIds() {
        const {featureOverlayIds} = this.props
        if (featureOverlayIds === undefined) {
            const overlays = this.getFeatureOverlayIds()
            return overlays.map(layer => layer.id)
        } else {
            return featureOverlayIds
        }
    }

    toggleFeatureOverlay = selectedOverlayId => {
        const {statePath} = this.props
        const featureOverlays = this.getFeatureOverlayIds()
        const prevOverlayIds = this.selectedFeatureOverlayIds()
        const alreadySelected = prevOverlayIds.includes(selectedOverlayId)
        const overlay = featureOverlays.find(layer => layer.id === selectedOverlayId)
        overlay && overlay.hide(alreadySelected)
        const nextOverlayIds = alreadySelected
            ? prevOverlayIds.filter(id => id !== selectedOverlayId)
            : [...prevOverlayIds, selectedOverlayId]
        actionBuilder('SET_FEATURE_OVERLAYS', {nextOverlayIds})
            .set([statePath, 'featureOverlayIds'], nextOverlayIds)
            .build()
            .dispatch()
    }
}

const policy = () => ({
    _: 'allow'
})

export const LayersMenu = compose(
    _LayersMenu,
    form({fields, mapStateToProps}),
    activatable({id: 'layersMenu', policy})
)

const sequence = (start, end, step = 1) =>
    Array.apply(null, {length: Math.floor((end - start) / step) + 1})
        .map((_, i) => i * step + start)

LayersMenu.propTypes = {
    labelLayerIndex: PropTypes.any.isRequired,
    mapContext: PropTypes.object.isRequired,
    statePath: PropTypes.any.isRequired
}
