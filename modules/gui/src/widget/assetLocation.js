import {AssetItem} from './assetItem'
import {Button} from './button'
import {Input} from './input'
import {ScrollableList} from './list'
import {SearchBox} from './searchBox'
import {Tree} from 'tree'
import {Widget} from './widget'
import {compose} from 'compose'
import {isEqual} from 'hash'
import {msg} from 'translate'
import {withAssets} from './assets'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './assetLocation.module.css'

const isFolder = type => type === 'Folder'

class _AssetLocation extends React.Component {
    constructor(props) {
        super(props)
        this.onInputChange = this.onInputChange.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.onSelectFolder = this.onSelectFolder.bind(this)
        this.onSelectAsset = this.onSelectAsset.bind(this)
    }

    input = React.createRef()

    state = {
        filter: '',
        filteredTree: Tree.createNode(),
        selectedId: null
    }

    render() {
        const {className, label, labelButtons, tooltip, tooltipPlacement, disabled, errorMessage} = this.props
        const {filteredTree} = this.state
        return (
            <Widget
                className={className}
                label={label}
                labelButtons={labelButtons}
                tooltip={tooltip}
                tooltipPlacement={tooltipPlacement}
                disabled={disabled}
                errorMessage={errorMessage}
                layout='vertical-fill'
                spacing='compact'>
                {this.renderInput()}
                {this.renderFolderTree(filteredTree)}
                {this.renderFilter()}
            </Widget>
        )
    }

    renderInput() {
        const {value} = this.props
        return (
            <Input
                ref={this.input}
                value={value}
                onChange={this.onInputChange}
            />
        )
    }

    renderFilter() {
        return (
            <SearchBox
                placeholder={msg('asset.browser.filter.placeholder')}
                width='fill'
                onSearchValue={this.onFilterChange}
            />
        )
    }

    renderFolderTree(node) {
        const {selectedId} = this.state
        const options = this.getFolderTreeOptions(node)
        return (
            <ScrollableList
                options={options}
                selectedValue={selectedId}
                onSelect={this.onSelectFolder}
                tooltipPlacement='bottomRight'
                keyboard={false}
            />
        )
    }

    renderFolderAssets(node) {
        const options = this.getFolderAssetsOptions(node)
        return options.length ? (
            ({close}) =>
                <ScrollableList
                    className={styles.folderAssets}
                    options={options}
                    onSelect={asset => {
                        this.onSelectAsset(asset)
                        close()
                    }}
                    keyboard={false}
                />
        ) : null
    }

    renderItem({id, type, depth, tooltip}) {
        const showTailOnly = depth > 0 || !isFolder(type)
        return (
            <AssetItem
                key={id}
                id={id}
                type={type}
                tail={showTailOnly}
                inlineComponents={[
                    this.renderFolderAssetsButton(tooltip)
                ]}
            />
        )
    }

    renderFolderAssetsButton(tooltip) {
        return tooltip ? (
            <Button
                key='link'
                chromeless
                air='none'
                size='small'
                icon='bars'
                dimmed
                tooltip={tooltip}
                tooltipPlacement='bottomLeft'
            />
        ) : null
    }

    getFolderTreeOptions({items} = {}, depth = 0) {
        return _(items)
            .pickBy(node => isFolder(node.props.type))
            .map((node, id) => [
                this.getItemOption({id, type: node.props.type, depth, node}),
                ...this.getFolderTreeOptions(node, depth + 1)
            ])
            .flatten()
            .value()
    }

    getFolderAssetsOptions({items} = {}) {
        return _(items)
            .pickBy(node => !isFolder(node.props.type))
            .map((node, id) => this.getItemOption({id, type: node.props.type}))
            .value()
    }

    getItemOption({id, type, depth, node}) {
        const tooltip = this.renderFolderAssets(node)
        const render = () => this.renderItem({id, type, depth, tooltip})
        return {
            label: id,
            value: id,
            indent: depth,
            render
        }
    }

    onInputChange(e) {
        const {onChange} = this.props
        const value = e.target.value
        onChange && onChange(value)
    }
    
    onFilterChange(filter) {
        this.setState({filter})
    }

    getFilter() {
        const {filter} = this.state
        return id => id ? id.toLowerCase().includes(filter.toLowerCase()) : true
    }
    
    onSelectFolder({value}) {
        const {value: prevValue, onChange} = this.props
        const name = this.getAssetName(prevValue)
        onChange && onChange(`${value}/${name}`)
        this.focusInput()
    }
    
    onSelectAsset({value}) {
        const {onChange} = this.props
        onChange && onChange(value)
        this.focusInput()
    }

    focusInput() {
        this.input?.current.focus()
    }

    getClosestFolderId(assetId) {
        const {assets: {userAssets}} = this.props
        const folder = userAssets.find(({id, type}) => isFolder(type) && assetId === id)
        if (folder) {
            return folder.id
        } else {
            const parentId = this.getParentFolderId(assetId)
            return parentId.length
                ? this.getClosestFolderId(parentId)
                : ''
        }
    }

    getParentFolderId(assetId) {
        const index = assetId.lastIndexOf('/')
        return assetId.substr(0, index)
    }

    getAssetName(assetId) {
        const index = assetId.lastIndexOf('/')
        return assetId.substr(index + 1)
    }

    componentDidMount() {
        const {value, assets: {tree}} = this.props
        this.updateValue(value)
        this.updateTree(tree)
    }

    componentDidUpdate({value: prevValue, assets: {tree: prevTree}}, {filter: prevFilter}) {
        const {value, assets: {tree}} = this.props
        const {filter} = this.state
        if (value !== prevValue) {
            this.updateValue(value)
        }
        if (filter !== prevFilter || !isEqual(prevTree, tree)) {
            this.updateTree(tree)
        }
    }

    updateValue(value) {
        this.setState({
            selectedId: this.getClosestFolderId(value)
        })
    }

    updateTree(tree) {
        this.setState({
            filteredTree: Tree.filter(tree, this.getFilter())
        })
    }
}

export const AssetLocation = compose(
    _AssetLocation,
    withAssets()
)

AssetLocation.propTypes = {
    onChange: PropTypes.func.isRequired,
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any
}
