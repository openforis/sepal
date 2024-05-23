import _ from 'lodash'
import memoizeOne from 'memoize-one'
import PropTypes from 'prop-types'
import React from 'react'
import {debounceTime, first, map, Subject, switchMap, takeUntil} from 'rxjs'

import api from '~/apiRegistry'
import {toVisualizations} from '~/app/home/map/imageLayerSource/assetVisualizationParser'
import {copyToClipboard} from '~/clipboard'
import {compose} from '~/compose'
import {connect} from '~/connect'
import {escapeRegExp, splitString} from '~/string'
import {withSubscriptions} from '~/subscription'
import {msg} from '~/translate'
import {isServiceAccount} from '~/user'
import {uuid} from '~/uuid'
import {withAssets} from '~/widget/assets'
import {Button} from '~/widget/button'
import {CrudItem} from '~/widget/crudItem'
import {Notifications} from '~/widget/notifications'

import {Combo} from './combo'

// check for allowed characters and minimum path depth (2)
const ASSET_PATTERN = new RegExp('^[a-zA-Z0-9-_]+(/[a-zA-Z0-9-_]+){1,}$')
const MAX_RECENT = 5

const AWESOME_GEE_COMMUNITY_DATASETS_URL = 'https://github.com/samapriya/awesome-gee-community-datasets'
const GOOGLE_EARTH_ENGINE_CATALOG_URL = 'https://developers.google.com/earth-engine/datasets/'

const getHighlightMatcher = memoizeOne(
    filter => filter
        ? new RegExp(`(?:${_.compact(splitString(escapeRegExp(filter))).join('|')})`, 'i')
        : ''
)

const ASSET = 'asset'
const FOLDER = 'folder'

class _AssetCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.reloadAssets = this.reloadAssets.bind(this)
        this.copyIdToClipboard = this.copyIdToClipboard.bind(this)
    }

    assetChanged$ = new Subject()
    load$ = new Subject()
    filter$ = new Subject()

    state = {
        filter: '',
        loadingMetadata: false,
        datasets: {},
        searchingDatasets: false,
    }

    render() {
        const {
            busyMessage,
            options: _options, onChange: _onChange, // overridden
            ...otherProps
        } = this.props
        const options = this.getOptions()
        return options ? (
            <Combo
                options={options}
                busyMessage={(busyMessage || this.props.stream('LOAD_ASSET_METADATA').active) && msg('widget.loading')}
                buttons={[
                    this.renderCopyIdButton(),
                    this.renderReloadButton()
                ]}
                onChange={this.onChange}
                onFilterChange={this.onFilterChange}
                {...otherProps}
            />
        ) : null
    }

    renderReloadButton() {
        const {assets: {loading: loadingUserAssets}} = this.props
        const {searchingDatasets} = this.state
        return (
            <Button
                key='reload'
                chromeless
                shape='none'
                air='none'
                icon='rotate'
                iconAttributes={{spin: loadingUserAssets || searchingDatasets}}
                tooltip={msg('asset.reload')}
                tabIndex={-1}
                disabled={isServiceAccount() || loadingUserAssets || searchingDatasets}
                onClick={this.reloadAssets}
            />
        )
    }

    renderCopyIdButton() {
        const {value, mode} = this.props
        return mode === ASSET ? (
            <Button
                key='copyId'
                chromeless
                shape='none'
                air='none'
                icon='copy'
                tooltip={msg('asset.copyId.tooltip')}
                tabIndex={-1}
                disabled={!value}
                onClick={this.copyIdToClipboard}
            />
        ) : null
    }

    renderAsset({title, id, type, url}) {
        const {highlightMatcher} = this.state
        return (
            <CrudItem
                key={id}
                description={title || id}
                highlight={highlightMatcher}
                icon={this.getItemTypeIcon(type)}
                iconTooltip={this.getItemTooltip(type)}
                iconVariant={type === 'Folder' ? 'info' : null}
                inlineComponents={[
                    this.renderReferencePageButton(url)
                ]}
            />
        )
    }

    renderReferencePageButton(url) {
        return url ? (
            <Button
                key='link'
                chromeless
                shape='none'
                air='none'
                size='small'
                icon='arrow-up-right-from-square'
                linkUrl={url}
                linkTarget='_blank'
                dimmed
                tooltip='Open dataset reference page'
                tooltipPlacement='topRight'
            />
        ) : null
    }

    copyIdToClipboard() {
        const {value} = this.props
        copyToClipboard(value, msg('asset.copyId.success'))
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

    getCurrentValue() {
        const {value} = this.props
        return value
    }

    componentDidMount() {
        const {value} = this.props
        this.initializeDatasetsSearch()
        this.initializeSearch()
        this.initializeLoad()
        if (value) {
            this.load$.next(value)
        }
    }

    initializeSearch() {
        const {addSubscription, mode} = this.props
        addSubscription(
            this.filter$.subscribe(
                ({filter, filterReset}) => this.setState(({filter: prevFilter}) => ({
                    filter: filterReset ? prevFilter : filter,
                    highlightMatcher: getHighlightMatcher(filter),
                    searchingDatasets: !!filter && mode === ASSET
                }))
            )
        )
    }

    initializeLoad() {
        const {addSubscription} = this.props
        addSubscription(
            this.load$.pipe(
                switchMap(id => api.gee.datasets$(id))
            ).subscribe({
                next: ({community, gee}) => {
                    if (community.matchingResults + gee.matchingResults === 1) {
                        const [asset] = [...community.datasets, ...gee.datasets]
                        this.loadMetadata(asset)
                        this.setDatasets({community, gee})
                    }
                },
                error: error => {
                    this.clearDatasets()
                    Notifications.error({message: msg('asset.datasets.failedToLoad', {error}), error})
                }
            })
        )
    }

    initializeDatasetsSearch() {
        const {addSubscription, allowedTypes, mode} = this.props
        if (mode === ASSET) {
            addSubscription(
                this.filter$.pipe(
                    debounceTime(500),
                    map(({filter}) => filter ? filter : this.getCurrentValue()),
                    switchMap(search =>
                        api.gee.datasets$(search, allowedTypes).pipe(
                            takeUntil(this.filter$)
                        )
                    )
                ).subscribe({
                    next: ({community, gee}) => {
                        this.setDatasets({community, gee})
                    },
                    error: error => {
                        this.clearDatasets()
                        Notifications.error({message: msg('asset.datasets.failedToLoad', {error}), error})
                    }
                })
            )
        }
    }

    clearDatasets() {
        this.setDatasets({})
    }

    setDatasets(datasets = {}) {
        this.setState({
            datasets,
            searchingDatasets: false
        })
    }

    componentDidUpdate({value: prevValue}) {
        const {value} = this.props
        if (value && !prevValue) {
            this.load$.next(value)
        }
    }

    reloadAssets() {
        const {assets: {reloadAssets}} = this.props
        reloadAssets()
    }

    isAllowedType(type) {
        const {allowedTypes, mode} = this.props
        return _.isEmpty(allowedTypes) || (mode === 'FOLDER' && type === 'Folder') || allowedTypes.includes(type)
    }

    isPreferredType(type) {
        const {preferredTypes} = this.props
        return !type || type === 'Folder' || _.isEmpty(preferredTypes) || preferredTypes.includes(type)
    }

    isAssetLike(asset) {
        return asset.startsWith('gs://') || ASSET_PATTERN.test(asset)
    }

    getOptions() {
        return _.compact([
            ...this.getOwnOptions(),
            ...this.getExternalOptions()
        ])
    }

    getOwnOptions() {
        return [
            this.getCurrentFilterOptions(),
            this.getRecentAssetsOptions(),
            this.getUserAssetsOptions()
        ]
    }

    getExternalOptions() {
        const {mode} = this.props
        return mode === ASSET
            ? [
                this.getOtherAssetsOptions(),
                this.getAwesomeGeeCommunityDatasetsOptions(),
                this.getGeeCatalogOptions()
            ]
            : []
    }

    getCurrentFilterOptions() {
        const {filter} = this.state
        return filter ? {
            options: [{
                label: filter,
                value: filter,
                disabled: !this.isAssetLike(filter),
                alias: true,
                forceFilter: true
            }]
        } : null
    }

    getRecentAssetsOptions() {
        const {assets: {recentAssets, userAssets}, mode} = this.props
        const filteredRecentAssets = mode === FOLDER
            ? recentAssets.filter(({id: recentAssetId, type}) => type === 'Folder' && userAssets.find(({id}) => id === recentAssetId))
            : recentAssets

        return filteredRecentAssets?.length ? {
            label: msg('asset.recentAssets'),
            options: this.getAssetOptions(filteredRecentAssets.slice(0, MAX_RECENT), {
                alias: true
            })
        } : null
    }

    isChild = (assetId, folderId) =>
        assetId.startsWith(folderId) && assetId.indexOf('/', folderId.length) === -1

    getUserAssetsOptions() {
        const {mode} = this.props
        const {assets: {userAssets}} = this.props

        const assets = mode === FOLDER
            ? userAssets.filter(({type}) => type === 'Folder')
            : userAssets

        return assets?.length ? {
            label: msg('asset.userAssets'),
            options: this.getAssetOptions(assets)
        } : null
    }

    getOtherAssetsOptions() {
        const {assets: {otherAssets}} = this.props
        return otherAssets?.length ? {
            label: msg('asset.otherAssets'),
            options: this.getAssetOptions(otherAssets)
        } : null
    }

    getAwesomeGeeCommunityDatasetsOptions() {
        const {datasets: {community: {datasets: communityDatasets = [], matchingResults, moreResults} = {}}} = this.state
        const assets = communityDatasets.map(({title, id, type, url}) => ({
            title,
            id,
            type,
            url,
            searchableText: [title, id, type].join('|')
        }))
        return {
            label: msg('asset.datasets.community.label', {matchingResults}),
            options: this.getAssetOptions(assets, {moreResults}),
            tooltip: msg('asset.datasets.community.tooltip'),
            tooltipLinkUrl: AWESOME_GEE_COMMUNITY_DATASETS_URL
        }
    }

    getGeeCatalogOptions() {
        const {datasets: {gee: {datasets: geeCatalog = [], matchingResults, moreResults} = {}}} = this.state
        const assets = geeCatalog.map(({title, id, type, url}) => ({
            title,
            id,
            type,
            url,
            searchableText: [title, id, type].join('|')
        }))
        return {
            label: msg('asset.datasets.gee.label', {matchingResults}),
            options: this.getAssetOptions(assets, {moreResults}),
            tooltip: msg('asset.datasets.gee.tooltip'),
            tooltipLinkUrl: GOOGLE_EARTH_ENGINE_CATALOG_URL
        }
    }

    getAssetOptions(assets, {alias, updateFilter, forceFilter} = {}) {
        // const {mode} = this.props
        return assets
            .filter(({type}) => this.isAllowedType(type))
            .map(({title, id, type, url, searchableText, _depth}) => ({
                label: title || id,
                value: id,
                type,
                url,
                alias,
                searchableText,
                updateFilter: updateFilter && updateFilter(id, type),
                forceFilter: forceFilter && forceFilter(id, type),
                dimmed: !this.isPreferredType(type),
                // indent: mode === FOLDER ? depth : null,
                render: () => this.renderAsset({title, id, type, url})
            }))
    }

    onFilterChange(filter, filterReset) {
        this.filter$.next({filter, filterReset})
    }
    
    onChange(option) {
        const {onChange} = this.props
        const {label, value, type, url} = option
        const asset = {id: value, title: label, type, url}
        onChange && onChange(value, asset)
        this.loadMetadata(asset)
    }

    onError(assetId, error) {
        const {onError, assets: {updateAsset, removeAsset}} = this.props
        this.setState({loadingMetadata: false})
        if (onError && onError(error)) {
            updateAsset({id: assetId})
        } else {
            removeAsset(assetId)
        }
    }

    onLoaded(asset, metadata) {
        const {onLoaded, assets: {updateAsset}} = this.props
        const assetId = asset.id

        this.setState(
            ({filter}) => ({
                loadingMetadata: false,
                filter: filter !== assetId ? filter : null
            })
        )

        onLoaded && onLoaded(metadata ? {
            asset: assetId,
            metadata,
            visualizations: metadata.bands
                ? toVisualizations(metadata.properties, metadata.bands)
                    .map(visualization => ({...visualization, id: uuid()}))
                : undefined
        } : null)
        updateAsset({...asset, type: metadata.type})
    }

    onLoading(assetId) {
        const {onLoading} = this.props
        this.setState({loadingMetadata: assetId})
        this.assetChanged$.next()
        onLoading && onLoading(assetId)
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
        const {mode, stream} = this.props
        const {loadingMetadata} = this.state
        const assetId = asset.id
        if (mode === ASSET) {
            if (this.isAssetLike(assetId) && assetId !== loadingMetadata) {
                this.onLoading(assetId)
                stream({
                    name: 'LOAD_ASSET_METADATA',
                    stream$: this.getMetadata$(assetId).pipe(
                        takeUntil(this.assetChanged$),
                        first()
                    ),
                    onNext: metadata => this.onLoaded(asset, metadata),
                    onError: error => this.onError(assetId, error)
                })
            }
        }
    }
}

export const AssetCombo = compose(
    _AssetCombo,
    connect(),
    withSubscriptions(),
    withAssets()
)

AssetCombo.propTypes = {
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
    mode: PropTypes.oneOf([ASSET, FOLDER]),
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
    preferredTypes: PropTypes.array,
    readOnly: PropTypes.any,
    stayOpenOnSelect: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.string,
    onCancel: PropTypes.func,
    onChange: PropTypes.func,
    onError: PropTypes.func,
    onLoaded: PropTypes.func,
    onLoading: PropTypes.func
}

AssetCombo.defaultProps = {
    mode: ASSET
}
