import {Form} from 'widget/form'
import {Layout} from 'widget/layout'
import {Subject} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'connect'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import guid from 'guid'

const J_DAYS = 0
const FRACTIONAL_YEARS = 1
const UNIX_TIME_MILLIS = 2

class _AssetSection extends React.Component {
    constructor(props) {
        super(props)
        this.assetChanged$ = new Subject()
        this.onLoaded = this.onLoaded.bind(this)
    }

    render() {
        const {inputs: {asset, dateFormat}} = this.props
        return (
            <Layout>
                <Form.AssetCombo
                    input={asset}
                    label={msg('process.changeAlerts.panel.reference.form.asset.label')}
                    placeholder={msg('process.changeAlerts.panel.reference.form.asset.placeholder')}
                    autoFocus
                    allowedTypes={['Image', 'ImageCollection']}
                    onLoaded={this.onLoaded}
                />
                <Form.Buttons
                    label={msg('process.ccdc.panel.dates.form.dateFormat.label')}
                    input={dateFormat}
                    disabled={!asset.value}
                    multiple={false}
                    options={[
                        {
                            value: J_DAYS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.jDays.label')
                        },
                        {
                            value: FRACTIONAL_YEARS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.fractionalYears.label')
                        },
                        {
                            value: UNIX_TIME_MILLIS,
                            label: msg('process.ccdc.panel.dates.form.dateFormat.unixTimeMillis.label')
                        }
                    ]}
                />
            </Layout>
        )
    }

    onLoaded({metadata}) {
        const {inputs: {asset, dateFormat, bands, baseBands, segmentBands, startDate, endDate, visualizations}} = this.props
        const reference = toAssetReference(metadata.bands.map(({id}) => id), metadata.properties)
        if (reference.bands.length) {
            dateFormat.set(reference.dateFormat)
            bands.set(reference.bands)
            baseBands.set(reference.baseBands)
            segmentBands.set(reference.segmentBands)
            startDate.set(reference.endDate)
            endDate.set(reference.endDate)
            visualizations.set(reference.visualizations)
        } else {
            asset.setInvalid(msg('process.changeAlerts.panel.reference.asset.notCcdc'))
        }
    }
}

export const toAssetReference = (bands, properties) => {
    const baseBandPattern = /(.*)_(coefs|intercept|slope|phase_\d|amplitude_\d|rmse|magnitude)$/
    const bandAndType = _.chain(bands)
        .map(referenceBand => referenceBand.match(baseBandPattern))
        .filter(match => match)
        .map(([_, name, bandType]) => bandType === 'coefs'
            ? ['value', 'intercept', 'slope', 'phase_1', 'amplitude_1', 'phase_2', 'amplitude_2', 'phase_3', 'amplitude_3']
                .map(bandType => ({name, bandType}))
            : [{name, bandType}]
        )
        .flatten()
        .value()
    const bandByName = _.groupBy(bandAndType, ({name}) => name)
    const baseBands = _.chain(bandAndType)
        .map(({name}) => name)
        .uniq()
        .map(name => ({name, bandTypes: bandByName[name].map(({bandType}) => bandType)}))
        .value()
    const segmentBands = bands
        .filter(name => ['tStart', 'tEnd', 'tBreak', 'numObs', 'changeProb'].includes(name))
        .map(name => ({name}))
    const dateFormat = properties.dateFormat
    return {
        bands,
        baseBands,
        segmentBands,
        dateFormat,
        startDate: properties.startDate,
        endDate: properties.endDate,
        visualizations: toVisualizations(properties, bands)
            .map(visualization => ({...visualization, id: guid()}))
    }
}

export const AssetSection = compose(
    _AssetSection,
    connect()
)

AssetSection.propTypes = {
    inputs: PropTypes.object.isRequired
}
