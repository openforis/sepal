import {Form, form} from 'widget/form/form'
// import {Menu} from './menu'
import {Menu} from 'widget/menu/menu'
import {activatable} from 'widget/activation/activatable'
import {changeBaseLayer} from './baseLayer'
import {compose} from 'compose'
import {getNorwayPlanetApiKey} from './map'
import {googleMap, sepalMap} from 'app/home/map/map'
import {msg} from 'translate'
import {select} from 'store'
import ButtonSelect from 'widget/buttonSelect'
import Labels from './labels'
import PropTypes from 'prop-types'
import React from 'react'
import actionBuilder from '../../../action-builder'
import moment from 'moment'
import styles from './layersMenu.module.css'

const fields = {
    year: new Form.Field(),
    month: new Form.Field()
}

const mapStateToProps = (state, ownProps) => ({
    labelsShown: select([ownProps.statePath, 'labelsShown']),
    baseLayer: select([ownProps.statePath, 'baseLayer']),
    overlayIndex: select([ownProps.statePath, 'overlayIndex']),
    year: select([ownProps.statePath, 'options.year']),
    month: select([ownProps.statePath, 'options.month'])
})

class _LayersMenu extends React.Component {

    getPlanetDateOptions() {
        const {inputs: {year}} = this.props
        const startDate = moment('2018-08-01')
        const endDate = moment().subtract(1, 'months')

        const yearOptions = sequence(startDate.year(), moment().year())
            .map(year => ({value: `${year}`, label: `${year}`}))

        const allMonthOptions = moment.monthsShort()
            .map((label, i) => ({value: `${i + 1}`.padStart(2, '0'), label}))

        const monthOptions = year.value === `${startDate.year()}`
            ? allMonthOptions.slice(startDate.month() + 1)
            : year.value === `${endDate.year()}`
                ? allMonthOptions.slice(0, endDate.month() + 1)
                : allMonthOptions
        return {yearOptions, monthOptions}
    }

    toggleOverlay = ({selectedOverlayIndex, mapContext, statePath}) => {
        const context = sepalMap.getContext(mapContext)
        const overlays = context.toggleableLayers()

        const prevOverlayIndex = this.selectedOverlayIndex()
        if (selectedOverlayIndex !== prevOverlayIndex) {
            const prevOverlay = overlays.find(layer => layer.layerIndex === prevOverlayIndex)
            prevOverlay && prevOverlay.hide(googleMap, true)
        }

        const selectedOverlay = overlays.find(layer => layer.layerIndex === selectedOverlayIndex)
        const hide = prevOverlayIndex === selectedOverlayIndex
        selectedOverlay && selectedOverlay.hide(googleMap, hide)
        const nextOverlayIndex = hide ? -1 : selectedOverlayIndex

        actionBuilder('SET_OVERLAY', {nextOverlayIndex})
            .set([statePath, 'overlayIndex'], nextOverlayIndex)
            .build()
            .dispatch()
    }

    changeBaseLayer(type, year, month) {
        const {statePath, mapContext} = this.props
        const planetApiKey = getNorwayPlanetApiKey()
        changeBaseLayer({
            type,
            mapContext,
            statePath,
            options: {year: year.value, month: month.value, planetApiKey}
        })
    }

    selectedOverlayIndex() {
        const {overlayIndex, mapContext} = this.props
        if (overlayIndex === undefined) {
            const context = sepalMap.getContext(mapContext)
            const overlays = context.toggleableLayers()
            const firstOverlayIndex = overlays.length
                ? overlays.map(layer => layer.layerIndex)[0]
                : -1
            return firstOverlayIndex
        } else {
            return overlayIndex
        }
    }

    render() {
        const {
            inputs: {year, month},
            activatable: {deactivate},
            labelsShown, baseLayer, labelLayerIndex, statePath, mapContext
        } = this.props
        const context = sepalMap.getContext(mapContext)
        const overlays = context.toggleableLayers()
        const toggleableOptions = overlays.map(layer =>
            <Menu.Option
                key={layer.layerIndex}
                id={layer.layerIndex}
                label={layer.label}
                description={layer.description}/>)
        const {yearOptions, monthOptions} = this.getPlanetDateOptions()

        const yearOption = yearOptions.find(({value}) => year.value === value)
        const monthOption = monthOptions.find(({value}) => month.value === value)
        return (
            <Menu
                position='top-right'
                className={styles.panel}
                close={deactivate}>
                <Menu.Select
                    id={'BASE_LAYER'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.baseLayer')}
                    onSelect={type => this.changeBaseLayer(type, year, month)}
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
                                    input={year}
                                    tooltipPlacement='bottom'
                                    options={yearOptions}
                                    label={yearOption && yearOption.label}
                                    onSelect={year => this.changeBaseLayer('PLANET', year, month)}
                                />
                                <ButtonSelect
                                    placement='below'
                                    alignment='left'
                                    input={month}
                                    tooltipPlacement='bottom'
                                    options={monthOptions}
                                    label={monthOption && monthOption.label}
                                    onSelect={month => this.changeBaseLayer('PLANET', year, month)}
                                />
                            </div>
                        }/>
                </Menu.Select>
                <Menu.Separator/>
                <Menu.Select
                    id={'OVERLAYS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.overlay')}
                    onSelect={selectedOverlayIndex => this.toggleOverlay({selectedOverlayIndex, mapContext, statePath})}
                    selected={this.selectedOverlayIndex()}>
                    {toggleableOptions}
                </Menu.Select>
                <Menu.Toggle
                    id={'SHOW_LABELS'}
                    label={msg('process.mosaic.mapToolbar.layersMenu.labels.label')}
                    description={msg('process.mosaic.mapToolbar.layersMenu.labels.description')}
                    selected={labelsShown}
                    onChange={shown =>
                        Labels.showLabelsAction({
                            shown,
                            layerIndex: labelLayerIndex,
                            statePath,
                            mapContext
                        }).dispatch()}/>
            </Menu>
        )
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        const {inputs: {year, month}} = this.props
        if (!year.value)
            year.set(this.props.year || moment().format('YYYY'))
        if (!month.value)
            month.set(this.props.month || moment().subtract(1, 'months').format('MM'))
        else {
            const {monthOptions} = this.getPlanetDateOptions()
            if (!monthOptions.find(({value}) => month.value === value)) {
                const monthOption = monthOptions[0]
                month.set(monthOption.value)
                this.changeBaseLayer('PLANET', year, monthOption)
            }
        }
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
    mapContext: PropTypes.string.isRequired,
    statePath: PropTypes.any.isRequired
}
