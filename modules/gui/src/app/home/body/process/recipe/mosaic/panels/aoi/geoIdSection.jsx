import PropTypes from 'prop-types'
import React from 'react'

import {defaultBufferMeters, isPointGeometryType, minBufferMeters, parseGeoId} from '#sepal/geoId/geoId'
import api from '~/apiRegistry'
import {withRecipe} from '~/app/home/body/process/recipeContext'
import {compose} from '~/compose'
import {selectFrom} from '~/stateUtils'
import {msg} from '~/translate'
import {Form} from '~/widget/form'
import {Icon} from '~/widget/icon'
import {Layout} from '~/widget/layout'

import styles from './aoi.module.css'
import {allowsApply, GeoIdCheck, readBufferMeters} from './geoIdCheck'
import {PreviewMap} from './previewMap'

const outsideGeoIdSection = (_value, {section}) => section !== 'GEOID'

// The buffer is judged against the geometry the check confirmed, kept in geoIdGeometryType; before that, against
// what any geometry accepts.
export const geoIdFields = {
    geoId: new Form.Field()
        .skip(outsideGeoIdSection)
        .predicate(value => parseGeoId(value).error !== 'MULTIPLE', 'process.mosaic.panel.areaOfInterest.form.geoId.multiple')
        .predicate(value => parseGeoId(value).error !== 'NONE', 'process.mosaic.panel.areaOfInterest.form.geoId.none'),
    bufferMeters: new Form.Field()
        .skip(outsideGeoIdSection)
        .predicate(
            (value, {geoIdGeometryType}) => !readBufferMeters(value, geoIdGeometryType || undefined).invalid,
            'process.mosaic.panel.areaOfInterest.form.bufferMeters.invalid',
            ({geoIdGeometryType}) => ({min: minBufferMeters(geoIdGeometryType || undefined)})
        ),
    // What the section's check found, which Apply waits for. Never shown: the section explains it.
    geoIdStatus: new Form.Field()
        .skip(outsideGeoIdSection)
        .predicate(status => allowsApply({status}), 'process.mosaic.panel.areaOfInterest.form.geoId.checking'),
    geoIdGeometryType: new Form.Field()
}

const mapRecipeToProps = recipe => ({
    featureLayerSources: selectFrom(recipe, 'ui.featureLayerSources')
})

class _GeoIdSection extends React.Component {
    state = {check: {status: 'NONE'}}
    overlayGeoId = null

    constructor(props) {
        super(props)
        this.onCheck = this.onCheck.bind(this)
        this.normalizeGeoId = this.normalizeGeoId.bind(this)
        this.geoIdCheck = new GeoIdCheck({
            lookup$: ({geoId, bufferMeters}) => api.gee.aoiGeoId$({id: geoId, bufferMeters}),
            onChange: this.onCheck
        })
    }

    render() {
        const {check} = this.state
        return (
            <Layout>
                {this.renderGeoId()}
                {this.renderBufferMeters()}
                {check.status === 'NOT_CHECKED' ? this.renderNotChecked() : null}
                <PreviewMap/>
            </Layout>
        )
    }

    renderGeoId() {
        const {inputs: {geoId}} = this.props
        const {check} = this.state
        return (
            <Form.Input
                label={msg('process.mosaic.panel.areaOfInterest.form.geoId.label')}
                tooltip={this.renderTooltip()}
                tooltipPlacement='bottom'
                placeholder={msg('process.mosaic.panel.areaOfInterest.form.geoId.placeholder')}
                input={geoId}
                busyMessage={check.status === 'PENDING' && msg('process.mosaic.panel.areaOfInterest.form.geoId.checking')}
                spellCheck={false}
                autoFocus
                onBlur={this.normalizeGeoId}
            />
        )
    }

    renderTooltip() {
        return (
            <Layout spacing='compact'>
                <div>{msg('process.mosaic.panel.areaOfInterest.form.geoId.tooltip')}</div>
                <div>
                    <a target='_blank' rel='noopener noreferrer' href='https://www.openforis.org/geoid/'>
                        <Icon name='external-link-alt'/>
                        &nbsp;{msg('process.mosaic.panel.areaOfInterest.form.geoId.about')}
                    </a>
                    &nbsp;·&nbsp;
                    <a target='_blank' rel='noopener noreferrer' href='https://geoid.openforis.org/'>
                        <Icon name='external-link-alt'/>
                        &nbsp;{msg('process.mosaic.panel.areaOfInterest.form.geoId.lookUp')}
                    </a>
                </div>
            </Layout>
        )
    }

    // Worded for the geometry the check confirmed: only a point becomes a square, and before the geometry is
    // known an empty buffer means its default.
    renderBufferMeters() {
        const {inputs: {bufferMeters}} = this.props
        const {check: {geometryType}} = this.state
        const {value} = readBufferMeters(bufferMeters.value, geometryType)
        const geometry = !geometryType ? 'unknown' : isPointGeometryType(geometryType) ? 'point' : 'polygon'
        return (
            <Form.Input
                label={msg('process.mosaic.panel.areaOfInterest.form.bufferMeters.label')}
                tooltip={msg(`process.mosaic.panel.areaOfInterest.form.bufferMeters.tooltip.${geometry}`)}
                input={bufferMeters}
                type='number'
                placeholder={geometryType
                    ? String(defaultBufferMeters(geometryType))
                    : msg('process.mosaic.panel.areaOfInterest.form.bufferMeters.defaultPlaceholder')}
                suffix={geometry === 'point' && value !== undefined
                    ? msg('process.mosaic.panel.areaOfInterest.form.bufferMeters.square', {size: 2 * value})
                    : msg('process.mosaic.panel.areaOfInterest.form.bufferMeters.unit')}
            />
        )
    }

    renderNotChecked() {
        const {check: {error}} = this.state
        return (
            <div className={styles.warning}>
                <Icon name='triangle-exclamation'/>
                &nbsp;{msg('process.mosaic.panel.areaOfInterest.form.geoId.notChecked', {error})}
            </div>
        )
    }

    componentDidMount() {
        this.updateCheck()
    }

    componentDidUpdate(prevProps) {
        const {inputs: {geoId, bufferMeters}} = this.props
        if (geoId.value !== prevProps.inputs.geoId.value || bufferMeters.value !== prevProps.inputs.bufferMeters.value) {
            this.updateCheck()
        }
    }

    componentWillUnmount() {
        const {recipeActionBuilder} = this.props
        this.geoIdCheck.dispose()
        recipeActionBuilder('REMOVE_MAP_OVERLAY')
            .del('layers.overlay')
            .del('ui.overlay.bounds')
            .dispatch()
    }

    updateCheck() {
        const {inputs: {geoId, bufferMeters}} = this.props
        this.geoIdCheck.update({geoId: parseGeoId(geoId.value).geoId ?? null, bufferText: bufferMeters.value})
    }

    onCheck(check) {
        const {inputs: {geoId, bufferMeters, geoIdStatus, geoIdGeometryType}} = this.props
        const wasBlocking = isBlockingGeoId(this.state.check)
        this.setState({check})
        // Learned, not edited: what the check finds must not make the panel dirty.
        geoIdStatus.setInitialValue(check.status)
        geoIdGeometryType.setInitialValue(check.geometryType ?? '')
        bufferMeters.validate()
        if (isBlockingGeoId(check)) {
            geoId.setInvalid(check.error)
        } else if (wasBlocking) {
            geoId.setInvalid('')
        }
        this.updateBufferMeters(check)
        this.setOverlay(check)
    }

    updateBufferMeters({setBufferMeters}) {
        const {inputs: {bufferMeters}} = this.props
        if (setBufferMeters === null) {
            bufferMeters.value === '' || bufferMeters.set('')
        } else if (setBufferMeters !== undefined && readBufferMeters(bufferMeters.value).value === undefined) {
            // A geometry's default is learned, not edited.
            bufferMeters.setInitialValue(setBufferMeters)
        }
    }

    // The preview shows a checked GeoID only. While the same GeoID is rechecked, or its buffer is being corrected,
    // the previous area stays until a new one replaces it.
    setOverlay({status, geoId, bounds, bufferMeters}) {
        const {featureLayerSources, recipeActionBuilder} = this.props
        if (status === 'CHECKED') {
            const aoi = {type: 'GEOID', id: geoId, ...(bufferMeters === null ? {} : {bufferMeters})}
            const aoiLayerSource = featureLayerSources.find(({type}) => type === 'Aoi')
            this.overlayGeoId = geoId
            recipeActionBuilder('SET_MAP_OVERLAY')
                .set('layers.overlay', {featureLayers: [{sourceId: aoiLayerSource.id, layerConfig: {aoi}}]})
                .set('ui.overlay.bounds', bounds)
                .dispatch()
        } else if (this.overlayGeoId && !(['PENDING', 'INVALID_INPUT'].includes(status) && geoId === this.overlayGeoId)) {
            this.overlayGeoId = null
            recipeActionBuilder('CLEAR_MAP_OVERLAY')
                .del('layers.overlay')
                .del('ui.overlay.bounds')
                .dispatch()
        }
    }

    normalizeGeoId() {
        const {inputs: {geoId}} = this.props
        const {geoId: canonical} = parseGeoId(geoId.value)
        if (canonical && canonical !== geoId.value) {
            geoId.set(canonical)
        }
    }
}

export const GeoIdSection = compose(
    _GeoIdSection,
    withRecipe(mapRecipeToProps)
)

GeoIdSection.propTypes = {
    inputs: PropTypes.object.isRequired,
    recipeId: PropTypes.string.isRequired
}

const isBlockingGeoId = ({status}) =>
    ['NOT_FOUND', 'INVALID_GEOMETRY'].includes(status)
