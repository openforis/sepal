import {Buttons} from 'widget/buttons'
import {Combo} from 'widget/combo'
import {Item} from 'widget/item'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from '../mapAreaLayout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {get$} from 'http-client'
import {map} from 'rxjs/operators'
import {setActive, setComplete} from '../progress'
import {withMapAreaContext} from '../mapAreaContext'
import {withMapContext} from '../mapContext'
import {withRecipe} from '../../body/process/recipeContext'
import PropTypes from 'prop-types'
import React from 'react'
import WMTSLayer from '../wmtsLayer'
import _ from 'lodash'
import moment from 'moment'
import styles from './planetImageLayer.module.css'
import withSubscriptions from 'subscription'

const defaultLayerConfig = {
    bands: 'rgb'
}

const CONCURRENCY = 10

class _PlanetImageLayerSource extends React.Component {
    progress$ = new Subject()
    state = {}

    render() {
        const {map} = this.props
        return (
            <MapAreaLayout
                layer={this.createLayer()}
                form={this.renderForm()}
                map={map}
            />
        )
    }

    createLayer() {
        const {layerConfig: {bands, urlTemplate} = defaultLayerConfig, map} = this.props
        const concurrency = CONCURRENCY
        return urlTemplate
            ? this.selectedHasCir()
                ? new WMTSLayer({map, urlTemplate: `${urlTemplate}&proc=${bands}`, concurrency, progress$: this.progress$})
                : new WMTSLayer({map, concurrency, urlTemplate: `${urlTemplate}`})
            : null
    }

    renderForm() {
        return (
            <Layout>
                {this.renderMosaics()}
                {this.selectedHasCir() ? this.renderBands() : null}
            </Layout>
        )
    }

    renderBands() {
        const {layerConfig: {bands}} = this.props
        return (
            <Buttons
                label={'Bands'}
                selected={bands}
                onChange={bands => this.setBands(bands)}
                options={[
                    {value: 'rgb', label: 'RGB'},
                    {value: 'cir', label: 'CIR'}
                ]}/>
        )
    }

    selectedHasCir() {
        const {layerConfig: {urlTemplate}} = this.props
        const apiKey = this.getApiKey()
        const {[apiKey]: mosaics = []} = this.state
        const {hasCir = false} = mosaics.find(({urlTemplate: t}) => t === urlTemplate) || {}
        return hasCir
    }

    renderMosaics() {
        const {layerConfig: {urlTemplate}} = this.props
        const apiKey = this.getApiKey()
        const {[apiKey]: mosaics = []} = this.state

        const options = mosaics.map(({startDate, endDate, urlTemplate}) => {
            const start = moment(startDate, 'YYYY-MM-DD')
            const end = moment(endDate, 'YYYY-MM-DD')
            const months = end.diff(start, 'months')
            const duration = moment.duration(months, 'months').humanize()
            const date = start.format('MMMM YYYY')
            return ({
                value: urlTemplate,
                label: `${date} - ${duration}`,
                searchableText: `${date} ${duration}`,
                render: () =>
                    <div className={styles.imageLayerSourceOption}>
                        <Item title={duration} description={date}/>
                    </div>
            })
        })
        const selectedOption = options.find(({value}) => value === urlTemplate) || {}
        return (
            <Combo
                label={'Composite'}
                options={options}
                placeholder={selectedOption.label}
                value={selectedOption.value}
                disabled={!mosaics.length}
                onChange={({value}) => this.selectUrlTemplate(value)}
            />
        )
    }

    setActive(name) {
        const {recipeActionBuilder, componentId} = this.props
        setActive(`${name}-${componentId}`, recipeActionBuilder)
    }

    setComplete(name) {
        const {recipeActionBuilder, componentId} = this.props
        setComplete(`${name}-${componentId}`, recipeActionBuilder)
    }

    componentDidMount() {
        const {addSubscription} = this.props
        addSubscription(this.progress$.subscribe(
            ({complete}) => complete
                ? this.setComplete('tiles')
                : this.setActive('tiles')
        ))
        this.update()
    }

    componentDidUpdate(prevProps) {
        const prevApiKey = this.getApiKey(prevProps)
        const apiKey = this.getApiKey()
        if (apiKey !== prevApiKey) {
            const {[apiKey]: mosaics} = this.state
            if (mosaics) {
                this.selectUrlTemplate(mosaics[0].urlTemplate)
            }
        }
        this.update()
    }

    componentWillUnmount() {
        this.setComplete('tiles')
    }

    update() {
        const {stream} = this.props
        const apiKey = this.getApiKey()
        const {[apiKey]: mosaics} = this.state
        if (!mosaics && !stream(`LOAD_PLANET_MOSAICS_${apiKey}`).active) {
            stream(`LOAD_PLANET_MOSAICS_${apiKey}`,
                this.loadMosaics$(),
                mosaics => {
                    this.selectUrlTemplate(mosaics[0].urlTemplate)
                    this.setState({[apiKey]: mosaics})
                }
            )
        }
    }

    setBands(bands) {
        const {layerConfig: {urlTemplate}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({bands, urlTemplate})
    }

    selectUrlTemplate(urlTemplate) {
        const {layerConfig: {bands}, mapAreaContext: {updateLayerConfig}} = this.props
        updateLayerConfig({bands, urlTemplate})
    }

    loadMosaics$() {
        return get$(
            'https://api.planet.com/basemaps/v1/mosaics', {
                username: this.getApiKey(),
                crossDomain: true
            }
        ).pipe(
            map(({response: {mosaics}}) => _.orderBy(
                mosaics.map(({first_acquired, last_acquired, item_types, _links: {tiles}}) => ({
                    startDate: first_acquired.substring(0, 10),
                    endDate: last_acquired.substring(0, 10),
                    urlTemplate: tiles,
                    hasCir: item_types.includes('PSScene4Band')
                })),
                ['startDate', 'endDate'], ['desc', 'desc']
            ))
        )
    }

    getApiKey(props) {
        const {planetApiKey, mapContext: {norwayPlanetApiKey}} = props || this.props
        return planetApiKey || norwayPlanetApiKey
    }
}

export const PlanetImageLayer = compose(
    _PlanetImageLayerSource,
    withMapContext(),
    withMapAreaContext(),
    connect(),
    withRecipe(),
    withSubscriptions()
)

PlanetImageLayer.defaultProps = {
    layerConfig: defaultLayerConfig
}

PlanetImageLayer.propTypes = {
    layerConfig: PropTypes.object,
    map: PropTypes.object,
    planetApiKey: PropTypes.string
}
