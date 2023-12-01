import {Button} from 'widget/button'
import {Combo} from './combo'
import {CrudItem} from 'widget/crudItem'
import {Subject, debounceTime, first, map, switchMap, takeUntil} from 'rxjs'
import {compose} from 'compose'
import {connect} from 'store'
import {copyToClipboard} from 'clipboard'
import {escapeRegExp, splitString} from 'string'
import {isServiceAccount} from 'user'
import {msg} from 'translate'
import {toVisualizations} from 'app/home/map/imageLayerSource/assetVisualizationParser'
import {v4 as uuid} from 'uuid'
import {withAssets} from 'widget/assets'
import {withSubscriptions} from 'subscription'
import Notifications from 'widget/notifications'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import api from 'api'
import memoizeOne from 'memoize-one'

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

class _AssetCombo extends React.Component {
    constructor(props) {
        super(props)
        this.onChange = this.onChange.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.reloadAssets = this.reloadAssets.bind(this)
        this.copyIdToClipboard = this.copyIdToClipboard.bind(this)
    }

    assetChanged$ = new Subject()
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
        const {value} = this.props
        return (
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
        )
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
        if (value) {
            this.loadMetadata(value)
        }
        this.initializeDatasetsSearch()
        this.initializeSearch()
    }

    initializeSearch() {
        const {addSubscription, destination} = this.props
        addSubscription(
            this.filter$.pipe(
                debounceTime(100)
            ).subscribe(
                filter => this.setState({
                    filter,
                    highlightMatcher: getHighlightMatcher(filter),
                    searchingDatasets: !!filter && !destination
                })
            )
        )
    }

    initializeDatasetsSearch() {
        const {addSubscription, allowedTypes, destination} = this.props
        if (!destination) {
            addSubscription(
                this.filter$.pipe(
                    debounceTime(500),
                    map(filter => filter.length ? filter : this.getCurrentValue()),
                    switchMap(search =>
                        api.gee.datasets$(search, allowedTypes).pipe(
                            takeUntil(this.filter$)
                        )
                    )
                ).subscribe({
                    next: ({community, gee}) => {
                        this.setState({
                            datasets: {
                                community,
                                gee
                            },
                            searchingDatasets: false
                        })
                    },
                    error: error => {
                        this.setState({
                            datasets: {},
                            searchingDatasets: false
                        })
                        Notifications.error({message: msg('asset.datasets.failedToLoad', {error}), error})
                    }
                })
            )
        }
    }

    componentDidUpdate({value: prevValue}) {
        const {value} = this.props
        if (value && !prevValue) {
            this.loadMetadata(value)
        }
    }

    reloadAssets() {
        const {assets: {reloadAssets}} = this.props
        reloadAssets()
    }

    isAllowedType(type) {
        const {allowedTypes, showFolders} = this.props
        return _.isEmpty(allowedTypes) || (showFolders && type === 'Folder') || allowedTypes.includes(type)
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
        const {destination} = this.props
        return !destination
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
                filterOption: false
            }]
        } : null
    }

    getRecentAssetsOptions() {
        const {assets: {recentAssets, userAssets}, destination} = this.props
        const filteredRecentAssets = destination
            ? recentAssets.filter(({id: recentAssetId, type}) => !type || userAssets.find(({id}) => id === recentAssetId))
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
        const {showFolders} = this.props
        return showFolders
            ? this.getUserAssetsWithFolders()
            : this.getUserAssetsOnly()
    }

    getUserAssetsOnly() {
        const {assets: {userAssets}} = this.props
        return userAssets?.length ? {
            label: msg('asset.userAssets'),
            options: this.getAssetOptions(userAssets, {
                updateFilter: (id, type) => type === 'Folder' && `${id}/`, // set Combo filter to folder path.
                filterOption: (id, type) => {
                    // if (type === 'Folder' && filter.startsWith(id)) {
                    if (type === 'Folder') {
                        return false
                    }
                }
            })
        } : null
    }

    getUserAssetsWithFolders() {
        const {assets: {userAssets}} = this.props
        const {filter} = this.state
        const filteredUserAssets = userAssets
            .filter(({id, type}) => type === 'Folder' || type !== 'Folder' && this.isChild(id, filter))
            .toSorted(({id: idA, type: typeA}, {id: idB, type: typeB}) =>
                typeA === typeB
                    ? idA > idB ? 1 : -1
                    : typeA === 'Folder'
                        ? -1
                        : typeB === 'Folder'
                            ? 1
                            : idA > idB ? -1 : 1
            )
        return filteredUserAssets?.length ? {
            label: msg('asset.userAssets'),
            options: this.getAssetOptions(filteredUserAssets, {
                updateFilter: (id, type) => type === 'Folder' && `${id}/`, // set Combo filter to folder path.
                filterOption: (id, type) => {
                    // if (type === 'Folder' && filter.startsWith(id)) {
                    if (type === 'Folder') {
                        return false
                    }
                }
            })
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
        const assets = communityDatasets.map(({title, id, type}) => ({
            title,
            id,
            type,
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

    getAssetOptions(assets, {alias, updateFilter, filterOption} = {}) {
        const {showFolders} = this.props
        return assets
            .filter(({type}) => this.isAllowedType(type))
            .map(({title, id, type, url, searchableText, depth}) => ({
                label: title || id,
                value: id,
                alias,
                searchableText,
                updateFilter: updateFilter && updateFilter(id, type),
                filterOption: filterOption && filterOption(id, type),
                dimmed: !this.isPreferredType(type),
                indent: showFolders ? depth : null,
                render: () => this.renderAsset({title, id, type, url})
            }))
    }

    onFilterChange(filter) {
        this.filter$.next(filter)
    }

    onChange(option) {
        const {value: assetId} = option
        const {onChange} = this.props
        onChange && onChange(assetId)
        this.loadMetadata(assetId)
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

    defaultOnError(assetId, error) {
        const {input, assets: {removeAsset}} = this.props
        input.setInvalid(
            error.response && error.response.messageKey
                ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                : msg('widget.assetInput.loadError')
        )
        removeAsset(assetId)
    }

    onLoaded(assetId, metadata) {
        const {onLoaded, assets: {updateAsset}} = this.props

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

        updateAsset({id: assetId, type: metadata.type})
    }

    onLoading(asset) {
        const {onLoading} = this.props
        this.setState({loadingMetadata: asset})
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

    loadMetadata(assetId) {
        const {stream} = this.props
        const {loadingMetadata} = this.state
        if (this.isAssetLike(assetId) && assetId !== loadingMetadata) {
            this.onLoading(assetId)
            stream({
                name: 'LOAD_ASSET_METADATA',
                stream$: this.getMetadata$(assetId).pipe(
                    takeUntil(this.assetChanged$.pipe()),
                    first()
                ),
                onNext: metadata => this.onLoaded(assetId, metadata),
                onError: error => this.onError(assetId, error)
            })
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
    destination: PropTypes.any,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    inputClassName: PropTypes.string,
    keyboard: PropTypes.any,
    label: PropTypes.string,
    labelButtons: PropTypes.any,
    optionsClassName: PropTypes.string,
    optionTooltipPlacement: PropTypes.string,
    placeholder: PropTypes.string,
    placement: PropTypes.any,
    preferredTypes: PropTypes.array,
    readOnly: PropTypes.any,
    showFolders: PropTypes.any,
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
