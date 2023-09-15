import {Button} from 'widget/button'
import {ButtonGroup} from 'widget/buttonGroup'
import {CrudItem} from 'widget/crudItem'
import {Form} from 'widget/form/form'
import {Subject, first, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import {v4 as uuid} from 'uuid'
import {withAssets} from 'widget/assets'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import memoizeOne from 'memoize-one'

// check for allowed characters and minimum path depth (3)
const ASSET_PATTERN = new RegExp('^[a-zA-Z0-9-_]+(/[a-zA-Z0-9-_]+){2,}$')

const getHighlightMatcher = memoizeOne(
    filter => filter
        ? new RegExp(`(?:${_.compact(filter.split(/\s+/)).join('|')})`, 'i')
        : ''
)

class _FormAssetCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.reloadAssets = this.reloadAssets.bind(this)
    }

    assetChanged$ = new Subject()

    state = {
        filter: '',
        loading: false
    }

    render() {
        const {
            busyMessage,
            options: _options, onChange: _onChange, // overridden
            ...otherProps
        } = this.props
        const options = this.getOptions()
        return options ? (
            <Form.Combo
                options={options}
                busyMessage={(busyMessage || this.props.stream('LOAD_ASSET_METADATA').active) && msg('widget.loading')}
                buttons={[this.renderReloadButton()]}
                onChange={this.onChange}
                onFilterChange={this.onFilterChange}
                {...otherProps}
            />
        ) : null
    }

    renderLabelButtons() {
        return (
            <ButtonGroup spacing='none'>
                {this.renderReloadButton()}
            </ButtonGroup>
        )
    }

    renderReloadButton() {
        const {assets: {loading}} = this.props
        return (
            <Button
                key='reload'
                chromeless
                shape='none'
                air='none'
                icon='rotate'
                iconAttributes={{spin: loading}}
                tooltip={msg('asset.reload')}
                tabIndex={-1}
                disabled={loading}
                onClick={this.reloadAssets}
            />
        )
    }

    renderItem({id, type}) {
        const {filter} = this.state
        return (
            <CrudItem
                key={id}
                description={id}
                highlight={getHighlightMatcher(filter)}
                icon={this.getItemTypeIcon(type)}
                iconTooltip={this.getItemTooltip(type)}
                iconVariant={type === 'Folder' ? 'info' : null}
                tooltipPlacement='top'
            />
        )
    }

    getItemTypeIcon(type) {
        const ASSET_ICON = {
            Folder: 'folder-open',
            Image: 'image',
            ImageCollection: 'images',
            Table: 'table'
        }
        return ASSET_ICON[type] || 'asterisk'
    }
    
    getItemTooltip(type) {
        const ASSET_TOOLTIP = {
            Folder: msg('asset.folder'),
            Image: msg('asset.image'),
            ImageCollection: msg('asset.imageCollection'),
            Table: msg('asset.table')
        }
        return ASSET_TOOLTIP[type] || msg('asset.new')
    }

    componentDidMount() {
        const {input} = this.props
        if (input.value) {
            this.loadMetadata(input.value)
        }
    }
    
    componentDidUpdate({input: prevInput}) {
        const {input} = this.props
        if (input.value && !prevInput?.value) {
            this.loadMetadata(input.value)
        }
    }

    reloadAssets() {
        const {assets: {reloadAssets}} = this.props
        reloadAssets()
    }

    isAllowedType(type) {
        const {allowedTypes} = this.props
        return _.isEmpty(allowedTypes) || allowedTypes.includes(type)
    }

    isPreferredType(type) {
        const {preferredTypes} = this.props
        return !type || _.isEmpty(preferredTypes) || preferredTypes.includes(type)
    }

    isAssetLike(asset) {
        return ASSET_PATTERN.test(asset)
    }

    getOptions() {
        const {assets: {userAssets, otherAssets, recentAssets}} = this.props
        const {filter} = this.state
        return _.compact([
            filter ? {
                options: [{
                    label: filter,
                    value: filter,
                    disabled: !this.isAssetLike(filter),
                    alias: true
                }]
            } : null,
            recentAssets.length ? {
                label: msg('asset.recentAssets'),
                options: this.getAssets(recentAssets, {
                    alias: true
                })
            } : null,
            userAssets.length ? {
                label: msg('asset.userAssets'),
                options: this.getAssets(userAssets, {
                    filter: (id, type) => type === 'Folder' && `${id}/`
                })
            } : null,
            otherAssets.length ? {
                label: msg('asset.otherAssets'),
                options: this.getAssets(otherAssets)
            } : null
        ])
    }

    getAssets(assets, {alias, filter} = {}) {
        return assets
            .filter(({type}) => this.isAllowedType(type))
            .map(({id, type}) => ({
                label: id,
                value: id,
                alias,
                filter: filter && filter(id, type),
                dimmed: !this.isPreferredType(type),
                render: () => this.renderItem({id, type})
            }))
    }

    onFilterChange(filter) {
        this.setState({filter})
    }

    onChange({value: asset}) {
        const {onChange} = this.props
        onChange && onChange(asset)
        this.loadMetadata(asset)
    }

    onError(asset, error) {
        const {onError, assets: {updateAsset}} = this.props
        this.setState({loading: false})
        if (!onError || !onError(error)) {
            this.defaultOnError(asset, error)
        } else {
            updateAsset({id: asset})
        }
    }

    defaultOnError(asset, error) {
        const {input, assets: {removeAsset}} = this.props
        input.setInvalid(
            error.response && error.response.messageKey
                ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                : msg('widget.assetInput.loadError')
        )
        removeAsset(asset)
    }

    onLoaded(asset, metadata) {
        const {onLoaded, assets: {updateAsset}} = this.props

        this.setState(
            ({filter}) => ({
                loading: false,
                filter: filter !== asset ? filter : null
            })
        )

        onLoaded && onLoaded(metadata ? {
            asset,
            metadata,
            visualizations: metadata.bands
                ? toVisualizations(metadata.properties, metadata.bands)
                    .map(visualization => ({...visualization, id: uuid()}))
                : undefined
        } : null)

        updateAsset({id: asset, type: metadata.type})
    }

    onLoading(asset) {
        const {onLoading} = this.props
        this.setState({loading: asset})
        this.assetChanged$.next()
        onLoading && onLoading(asset)
    }

    getAssetType(asset) {
        const {assets: {userAssets, otherAssets}} = this.props
        return userAssets.find(({id}) => id === asset)?.type
            || otherAssets.find(({id}) => id === asset)?.type
    }

    getMetadata$(asset) {
        const {allowedTypes} = this.props
        return api.gee.assetMetadata$({asset, allowedTypes})
    }

    loadMetadata(asset) {
        const {stream} = this.props
        const {loading} = this.state
        if (this.isAssetLike(asset) && asset !== loading) {
            this.onLoading(asset)
            stream({
                name: 'LOAD_ASSET_METADATA',
                stream$: this.getMetadata$(asset).pipe(
                    takeUntil(this.assetChanged$.pipe()),
                    first()
                ),
                onNext: metadata => this.onLoaded(asset, metadata),
                onError: error => this.onError(asset, error)
            })
        }
    }
}

export const FormAssetCombo = compose(
    _FormAssetCombo,
    connect(),
    withAssets()
)

FormAssetCombo.propTypes = {
    input: PropTypes.any.isRequired,
    alignment: PropTypes.any,
    allowClear: PropTypes.any,
    allowedTypes: PropTypes.array,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.string,
    labelButtons: PropTypes.any,
    matchGroups: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
    preferredTypes: PropTypes.array,
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    onCancel: PropTypes.func,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func
}
