import {CrudItem} from 'widget/crudItem'
import {Form} from 'widget/form/form'
import {Subject, takeUntil, tap} from 'rxjs'
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
    }

    filterChanged$ = new Subject()
    assetChanged$ = new Subject()

    state = {
        filter: '',
        recentAssets: [],
        assetsLoading: false,
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
                    // <Button
                    //     key='info'
                    //     chromeless
                    //     shape='circle'
                    //     size='small'
                    //     icon='file-lines'
                    //     onClick={console.log}
                    // />
                ]}
                {...otherProps}
            />
        ) : null
    }

    renderTypeIcon(type) {
        return (
            <Icon
                key='type'
                name={this.getTypeIcon(type)}
                size='xs'
                variant='info'
                tooltip={type}
                tooltipPlacement='right'
            />
        )
    }

    renderItem({id, name, type}) {
        const {filter} = this.state
        return (
            <CrudItem
                key={id}
                title={name}
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
            IMAGE: 'image',
            IMAGECOLLECTION: 'images'
        }
        const TOOLTIPS = {
            IMAGE: msg('asset.image'),
            IMAGECOLLECTION: msg('asset.imageCollection')
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

    getOptions() {
        const {assets: {userAssets, otherAssets}} = this.props
        const {filter, recentAssets} = this.state
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
                label: msg('assets.recentAssets'),
                options: recentAssets.map(asset => ({
                    label: asset,
                    value: asset,
                    alias: true,
                    render: () => this.renderItem({id: asset})
                }))
            } : null,
            userAssets.length ? {
                label: msg('assets.userAssets'),
                options: userAssets.map(({id, name, type}) => ({
                    label: name,
                    value: id,
                    searchableText: id,
                    render: () => this.renderItem({id, name, type})
                }))
            } : null,
            otherAssets.length ? {
                label: msg('assets.otherAssets'),
                options: otherAssets.map(asset => ({
                    label: asset,
                    value: asset,
                    render: () => this.renderItem({id: asset})
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

    onError(error) {
        const {input, onError} = this.props
        if (onError) {
            onError(error)
        } else {
            input.setInvalid(
                error.response && error.response.messageKey
                    ? msg(error.response.messageKey, error.response.messageArgs, error.response.defaultMessage)
                    : msg('widget.assetInput.loadError')
            )
        }
    }

    onLoaded(asset, metadata) {
        const {onLoaded, maxRecent, assets: {userAssets, addOtherAsset}} = this.props
        onLoaded && onLoaded(metadata ? {
            asset,
            metadata,
            visualizations: metadata.bands
                ? toVisualizations(metadata.properties, metadata.bands)
                    .map(visualization => ({...visualization, id: uuid()}))
                : undefined
        } : null)

        this.setState(
            ({filter, recentAssets}) => ({
                filter: filter !== asset ? filter : null,
                recentAssets: _.uniq([asset, ...recentAssets]).slice(0, maxRecent)
            })
        )
        if (!_.find(userAssets, ({id}) => id === asset)) {
            addOtherAsset(asset)
        }
    }

    onLoading(asset) {
        const {onLoading} = this.props
        this.setState({loading: asset})
        this.assetChanged$.next()
        onLoading && onLoading(asset)
    }

    loadMetadata(asset) {
        const {expectedType, onLoaded, stream} = this.props
        const {loading} = this.state
        if (onLoaded && this.isAssetLike(asset) && asset !== loading) {
            this.onLoading(asset)
            stream('LOAD_ASSET_METADATA',
                (expectedType === 'Image'
                    ? api.gee.imageMetadata$({asset})
                    : api.gee.assetMetadata$({asset, expectedType})
                ).pipe(
                    takeUntil(this.assetChanged$.pipe()),
                    tap(() => this.setState({loading: null}))
                ),
                metadata => this.onLoaded(asset, metadata),
                error => this.onError(error)
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
    expectedType: PropTypes.any.isRequired,
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
    maxRecent: PropTypes.number,
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

FormAssetCombo.defaultProps = {
    maxRecent: 3
}
