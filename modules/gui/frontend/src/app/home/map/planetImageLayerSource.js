import {Buttons} from 'widget/buttons'
import {Layout} from 'widget/layout'
import {MapAreaLayout} from './mapAreaLayout'
import {compose} from 'compose'
import {connect} from 'store'
import {get$} from 'http-client'
import {map} from 'rxjs/operators'
import {withMapAreaContext} from './mapAreaContext'
import {withMapContext} from './mapContext'
import ButtonSelect from 'widget/buttonSelect'
import PropTypes from 'prop-types'
import React from 'react'
import WMTSLayer from './wmtsLayer'
import _ from 'lodash'
import moment from 'moment'

const defaultLayerConfig = {
    bands: 'rgb'
}

export class PlanetImageLayerSource extends React.Component {
    render() {
        const {output} = this.props
        switch (output) {
        case 'LAYER':
            return <Layer {...this.props}/>
        case 'DESCRIPTION':
            return <Description {...this.props}/>
        default:
            throw Error(`Unsupported output type: ${output}`)
        }
    }
}

const Description = ({description}) =>
    <React.Fragment>{description}</React.Fragment>

class _Layer extends React.Component {
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
        return urlTemplate
            ? new WMTSLayer({map, urlTemplate: `${urlTemplate}&proc=${bands}`})
            : null
    }

    renderForm() {
        return (
            <Layout>
                {this.renderMosaics()}
                {this.renderBands()}
            </Layout>
        )
    }

    renderBands() {
        const {layerConfig: {bands}} = this.props
        return (
            <Buttons
                label={'Pan sharpen'}
                selected={bands}
                onChange={bands => this.setBands(bands)}
                options={[
                    {value: 'rgb', label: 'RGB'},
                    {value: 'cir', label: 'CIR'}
                ]}/>
        )
    }

    renderMosaics() {
        const {layerConfig: {urlTemplate}} = this.props
        const {mosaics = []} = this.state

        const mosaicOptions = mosaics.map(({startDate, endDate, urlTemplate}) => {
            const start = moment(startDate, 'YYYY-MM-DD')
            const end = moment(endDate, 'YYYY-MM-DD')
            const months = end.diff(start, 'months')
            const duration = moment.duration(months, 'months').humanize()
            const date = start.format('MMM YYYY')
            return ({
                value: urlTemplate,
                label: `${date} (${duration})`
            })
        })
        const selectedOption = mosaicOptions.find(({value}) => value === urlTemplate)
        return (
            <ButtonSelect
                options={mosaicOptions}
                label={selectedOption && selectedOption.label}
                disabled={!mosaics.length}
                onSelect={({value}) => this.selectUrlTemplate(value)}
            />
        )
    }

    componentDidMount() {
        const {stream} = this.props
        const {mosaics} = this.state
        if (!mosaics) {
            stream('LOAD_PLANET_MOSAICS',
                this.loadMosaics$(),
                mosaics => {
                    this.selectUrlTemplate(mosaics[mosaics.length - 1].urlTemplate)
                    this.setState({mosaics})
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
        const {planetApiKey, mapContext: {norwayPlanetApiKey}} = this.props
        return get$(
            'https://api.planet.com/basemaps/v1/mosaics',
            {username: planetApiKey || norwayPlanetApiKey}
        ).pipe(
            map(({response: {mosaics}}) => _.orderBy(
                mosaics.map(({first_acquired, last_acquired, _links: {tiles}}) => ({
                    startDate: first_acquired.substring(0, 10),
                    endDate: last_acquired.substring(0, 10),
                    urlTemplate: tiles
                })),
                ['startDate', 'endDate']
            ))
        )
    }
}

const Layer = compose(
    _Layer,
    withMapContext(),
    withMapAreaContext(),
    connect()
)

PlanetImageLayerSource.defaultProps = {
    layerConfig: defaultLayerConfig
}

PlanetImageLayerSource.propTypes = {
    output: PropTypes.oneOf(['LAYER', 'DESCRIPTION']).isRequired,
    layerConfig: PropTypes.object,
    map: PropTypes.object,
    planetApiKey: PropTypes.string
}
