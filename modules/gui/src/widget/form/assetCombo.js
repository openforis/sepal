import {Button} from 'widget/button'
import {CrudItem} from 'widget/crudItem'
import {Form} from 'widget/form/form'
import {Subject, of, switchMap, takeUntil, tap} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {isEqual} from 'hash'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import {v4 as uuid} from 'uuid'
import {withAssets} from 'widget/assets'
import Icon from 'widget/icon'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import memoizeOne from 'memoize-one'

const getHighlightMatcher = memoizeOne(
    filter => {
        if (filter) {
            const filterValues = _.compact(filter.split(/\s+/))
            return new RegExp(`(?:${filterValues.join('|')})`, 'i')
        }
        return ''
    }
)

class _FormAssetCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.reloadAssets = this.reloadAssets.bind(this)
    }

    filterChanged$ = new Subject()
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
                onChange={this.onChange}
                onFilterChange={this.onFilterChange}
                additionalButtons={[
                    this.renderLoadingIndicator()
                ]}
                {...otherProps}
            />
        ) : null
    }

    renderLoadingIndicator() {
        const {assets: {loading}} = this.props
        return (
            <Button
                key='reload'
                chromeless
                shape='none'
                air='none'
                icon='rotate'
                iconAttributes={{
                    spin: loading
                }}
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
                inlineComponents={[
                    this.renderItemType(type)
                ]}
            />
        )
    }

    renderItemType(type) {
        const ICONS = {
            Folder: 'folder',
            Image: 'image',
            ImageCollection: 'images',
            Table: 'table'
        }
        const TOOLTIPS = {
            Folder: msg('asset.folder'),
            Image: msg('asset.image'),
            ImageCollection: msg('asset.imageCollection'),
            Table: msg('asset.table')
        }
        const name = ICONS[type]
        return name ? (
            <Icon
                key='type'
                name={name}
                tooltip={TOOLTIPS[type]}
                tooltipPlacement='right'
            />
        ) : null
    }

    componentDidMount() {
        const {assets: {userAssets, otherAssets}, input} = this.props
        if (input.value) {
            this.loadMetadata(input.value)
        }
        if (userAssets) {
            this.updateUserAssets(userAssets)
        }
        if (otherAssets) {
            this.updateOtherAssets(otherAssets)
        }
    }
    
    componentDidUpdate({assets: {userAssets: prevUserAssets, otherAssets: prevOtherAssets}, input: prevInput}) {
        const {assets: {userAssets, otherAssets}, input} = this.props
        if (input.value && !prevInput?.value) {
            this.loadMetadata(input.value)
        }
        if (!isEqual(userAssets, prevUserAssets)) {
            this.updateUserAssets(userAssets)
        }
        if (!isEqual(otherAssets, prevOtherAssets)) {
            this.updateOtherAssets(otherAssets)
        }
    }

    reloadAssets() {
        const {assets: {reloadAssets}} = this.props
        reloadAssets()
    }

    isAllowedType(type) {
        const {allowedTypes} = this.props
        return allowedTypes.includes(type)
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
                options: recentAssets
                    .filter(({type}) => this.isAllowedType(type))
                    .map(({id, type}) => ({
                        label: id,
                        value: id,
                        alias: true,
                        render: () => this.renderItem({id, type})
                    }))
            } : null,
            userAssets.length ? {
                label: msg('asset.userAssets'),
                options: userAssets
                    .filter(({type}) => this.isAllowedType(type))
                    .map(({id, type}) => ({
                        label: id,
                        value: id,
                        render: () => this.renderItem({id, type})
                    }))
            } : null,
            otherAssets.length ? {
                label: msg('asset.otherAssets'),
                options: otherAssets
                    .filter(({type}) => this.isAllowedType(type))
                    .map(({id, type}) => ({
                        label: id,
                        value: id,
                        render: () => this.renderItem({id, type})
                    }))
            } : null
        ])
    }

    updateUserAssets(userAssets) {
        this.setState({userAssets})
    }

    updateOtherAssets(otherAssets) {
        this.setState({otherAssets})
    }

    onFilterChange(filter) {
        this.setState({filter})
    }

    isAssetLike(asset) {
        // check for allowed characters and minimum path depth (3)
        const ASSET_PATTERN = new RegExp('^[a-zA-Z0-9-_]+(/[a-zA-Z0-9-_]+){2,}$')
        return ASSET_PATTERN.test(asset)
    }

    onChange({value: asset}) {
        const {onChange} = this.props
        onChange && onChange(asset)
        this.loadMetadata(asset)
    }

    onError(asset, error) {
        const {input, onError, assets: {removeAsset}} = this.props
        if (onError) {
            onError(error)
        } else {
            input.setInvalid(
                error.response && error.response.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : msg('widget.assetInput.loadError')
            )
        }
        removeAsset(asset)
    }

    onLoaded(asset, metadata) {
        const {onLoaded, assets: {updateAsset}} = this.props
        onLoaded && onLoaded(metadata ? {
            asset,
            metadata,
            visualizations: metadata.bands
                ? toVisualizations(metadata.properties, metadata.bands)
                    .map(visualization => ({...visualization, id: uuid()}))
                : undefined
        } : null)

        this.setState(
            ({filter}) => ({
                filter: filter !== asset ? filter : null
            })
        )
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
        const assetType = this.getAssetType(asset)
        return assetType === 'Image'
            ? api.gee.imageMetadata$({asset})
            : api.gee.assetMetadata$({asset, expectedType: allowedTypes}).pipe(
                switchMap(assetMetadata =>
                    assetMetadata.type === 'Image'
                        ? api.gee.imageMetadata$({asset})
                        : of(assetMetadata)
                )
            )
    
    }

    loadMetadata(asset) {
        const {stream} = this.props
        const {loading} = this.state
        if (this.isAssetLike(asset) && asset !== loading) {
            this.onLoading(asset)
            stream('LOAD_ASSET_METADATA',
                this.getMetadata$(asset).pipe(
                    takeUntil(this.assetChanged$.pipe()),
                    tap(() => this.setState({loading: null}))
                ),
                metadata => this.onLoaded(asset, metadata),
                error => this.onError(asset, error)
            )
        }
    }
}

export const FormAssetCombo = compose(
    _FormAssetCombo,
    connect(),
    withAssets()
)

FormAssetCombo.propTypes = {
    allowedTypes: PropTypes.array.isRequired,
    input: PropTypes.any.isRequired,
    additionalButtons: PropTypes.any,
    alignment: PropTypes.any,
    allowClear: PropTypes.any,
    autoFocus: PropTypes.any,
    autoOpen: PropTypes.any,
    busyMessage: PropTypes.any,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.string,
    matchGroups: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
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
