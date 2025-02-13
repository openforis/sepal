import _ from 'lodash'
import PropTypes from 'prop-types'
import React from 'react'

import {AssetTree} from '~/app/home/body/browse/assets/assetTree'
import {compose} from '~/compose'
import format from '~/format'
import {isEqual} from '~/hash'
import {msg} from '~/translate'
import {isServiceAccount} from '~/user'
import {Form} from '~/widget/form'
import {withForm} from '~/widget/form/form'
import {Notifications} from '~/widget/notifications'

import {withActivatable} from './activation/activatable'
import styles from './assetDestinationBrowser.module.css'
import {withAssets} from './assets'
import {Button} from './button'
import {ButtonPopup} from './buttonPopup'
import {CrudItem} from './crudItem'
import {Input} from './input'
import {ScrollableList} from './list'
import {Panel} from './panel/panel'
import {SearchBox} from './searchBox'
import {isMobile} from './userAgent'
import {Widget} from './widget'

const fields = {
    asset: new Form.Field().notBlank()
}

const mapStateToProps = (_state, ownProps) => ({
    values: {
        asset: ownProps?.assetId || ownProps?.activatable?.activatables?.assetBrowser?.activationProps?.assetId
    }
})

class _AssetDestinationBrowser extends React.Component {
    constructor(props) {
        super(props)
        this.reloadAssets = this.reloadAssets.bind(this)
        this.onInputChange = this.onInputChange.bind(this)
        this.onFolderSelect = this.onFolderSelect.bind(this)
        this.onAssetSelect = this.onAssetSelect.bind(this)
        this.onFilterChange = this.onFilterChange.bind(this)
        this.onApply = this.onApply.bind(this)
    }

    input = React.createRef()

    state = {
        filter: '',
        filteredTree: AssetTree.create(),
        selectedFolder: null
    }

    render() {
        const {form, activatable: {deactivate}} = this.props
        return (
            <Form.Panel
                className={styles.panel}
                form={form}
                onApply={this.onApply}
                onCancel={deactivate}
                modal>
                <Panel.Header
                    title={msg('asset.browser.title')}
                    label={ this.renderReloadButton() }
                />
                <Panel.Content scrollable={false}>
                    <Widget
                        label={msg('asset.browser.asset')}
                        layout='vertical-fill'
                        spacing='compact'>
                        {this.renderInput()}
                        {this.renderFolderTree()}
                        {this.renderFilter()}
                    </Widget>
                </Panel.Content>
                <Form.PanelButtons>
                    {this.renderCreateFolderButton()}
                </Form.PanelButtons>
            </Form.Panel>
        )
    }

    renderReloadButton() {
        const {assets: {loading, updating}} = this.props
        const busy = loading || updating
        return (
            <Button
                key='reload'
                chromeless
                shape='none'
                air='none'
                icon='rotate'
                iconAttributes={{spin: busy}}
                tooltip={msg('asset.reload')}
                tabIndex={-1}
                disabled={isServiceAccount() || busy}
                onClick={this.reloadAssets}
            />
        )
    }

    renderCreateFolderButton() {
        const {selectedFolder} = this.state
        return (
            <ButtonPopup
                look='add'
                icon='plus'
                label={msg('Create folder')}
                vPlacement='below'
                hPlacement='over-right'
                disabled={!selectedFolder}>
                {close => (
                    <Input
                        className={styles.createFolder}
                        autoFocus
                        placeholder={msg('Enter folder name')}
                        onAccept={folder => {
                            if (folder.length && this.createFolder(folder)) {
                                close()
                            }
                        }}
                        onCancel={close}
                    />
                )}
            </ButtonPopup>
        )
    }

    createFolder(folder) {
        const {assets: {createFolder, isExistingPath}} = this.props
        const {selectedFolder} = this.state
        const path = [...selectedFolder, folder]
        if (isExistingPath(path)) {
            Notifications.error({
                message: msg('browse.createFolder.existing.error'),
                timeout: 5
            })
            
        } else {
            createFolder(path)
            return true
        }
        return false
    }

    renderInput() {
        const {form, inputs: {asset}} = this.props
        return (
            <Input
                ref={this.input}
                errorMessage={form.getErrorMessage(asset)}
                value={asset.value}
                onChange={this.onInputChange}
            />

        )
    }

    renderFolderTree() {
        const {filteredTree, selectedFolder} = this.state
        const options = this.getFolderTreeOptions(AssetTree.getChildNodes(filteredTree))
        return (
            <ScrollableList
                options={options}
                selectedValue={selectedFolder ? AssetTree.toStringPath(selectedFolder) : null}
                onSelect={this.onFolderSelect}
                keyboard={false}
            />
        )
    }

    renderFolderAssets(nodes) {
        const options = this.getFolderAssetsOptions(nodes)
        return options.length ? (
            ({close}) =>
                <ScrollableList
                    className={styles.folderAssets}
                    options={options}
                    keyboard={false}
                    onSelect={asset => {
                        this.onAssetSelect(asset)
                        close()
                    }}
                />
        ) : null
    }

    renderQuota(quota) {
        return quota ? (
            <div>
                {msg('asset.browser.quota', {quota: format.fileSize(parseInt(quota.maxSizeBytes), {unit: 'iB'})})}
            </div>
        ) : null
    }

    renderItem(node) {
        const quotaTooltip = this.renderQuota(AssetTree.getQuota(node))
        const assetsTooltip = this.renderFolderAssets(AssetTree.getChildNodes(node))
        const id = AssetTree.toStringPath(AssetTree.getPath(node))
        const path = AssetTree.getPath(node)
        const type = AssetTree.getType(node)
        const unconfirmed = AssetTree.isUnconfirmed(node)
        return (
            <CrudItem
                key={id}
                description={this.getDescription(path)}
                icon={this.getItemTypeIcon(type)}
                iconTooltip={this.getItemTooltip(type)}
                iconVariant='info'
                iconDimmed={unconfirmed}
                inlineComponents={[
                    this.renderFolderInfoButton(quotaTooltip),
                    this.renderFolderAssetsButton(assetsTooltip)
                ]}
            />
        )
    }

    getDescription(path) {
        return path.at(-1)
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

    renderFolderInfoButton(tooltip) {
        return tooltip ? (
            <Button
                key='info'
                chromeless
                air='none'
                icon='database'
                dimmed
                tooltip={tooltip}
                tooltipPlacement={isMobile() ? 'bottomRight' : 'bottomLeft'}
            />
        ) : null
    }

    renderFolderAssetsButton(tooltip) {
        return tooltip ? (
            <Button
                key='assets'
                chromeless
                air='none'
                icon='bars'
                dimmed
                tooltip={tooltip}
                tooltipPlacement={isMobile() ? 'bottomRight' : 'bottomLeft'}
                tooltipClickTrigger={true}
            />
        ) : null
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

    reloadAssets() {
        const {assets: {reloadAssets}} = this.props
        reloadAssets()
    }

    getFolderTreeOptions(nodes) {
        return _(nodes)
            .filter(node => AssetTree.isDirectory(node))
            .map(node => ([
                this.getItemOption(node, true),
                ...this.getFolderTreeOptions(AssetTree.getChildNodes(node))
            ]))
            .flatten()
            .value()
    }

    getFolderAssetsOptions(nodes) {
        return _(nodes)
            .filter(node => !AssetTree.isDirectory(node))
            .map(node => this.getItemOption(node, false))
            .value()
    }

    getItemOption(node, indent) {
        const render = () => this.renderItem(node)
        const path = AssetTree.getPath(node)
        return {
            label: path.at(-1),
            value: AssetTree.toStringPath(path),
            path,
            indent: indent && AssetTree.getDepth(node),
            render
        }
    }

    getFilter() {
        const {filter} = this.state
        return node => {
            const path = AssetTree.getPath(node)
            return path.length ? _.last(path).toLowerCase().includes(filter.toLowerCase()) : true
        }
    }
    
    getCurrentAssetName() {
        const {inputs: {asset: {value: assetId}}} = this.props
        const index = assetId.lastIndexOf('/')
        return assetId.substr(index + 1)
    }

    onInputChange({target: {value: assetId}}) {
        this.updateAsset(assetId)
    }

    onFolderSelect({path}) {
        this.updateAsset(AssetTree.toStringPath([...path, this.getCurrentAssetName()]))
        this.focusInput()
    }
    
    onAssetSelect({path}) {
        this.updateAsset(AssetTree.toStringPath(path))
        this.focusInput()
    }

    onFilterChange(filter) {
        this.setState({filter})
    }

    onApply() {
        const {inputs: {asset: {value: assetId}}, onChange, activatable: {deactivate}} = this.props
        onChange && onChange(assetId)
        deactivate()
    }

    focusInput() {
        this.input?.current.focus()
    }

    updateTree(tree) {
        this.setState({filteredTree: AssetTree.filter(tree, this.getFilter())})
    }

    updateAsset(assetId) {
        const {inputs: {asset}} = this.props
        asset.set(assetId)
        if (assetId) {
            const assetPath = AssetTree.fromStringPath(assetId)
            this.setState({selectedFolder: this.getClosestFolder(assetPath)})
        }
    }

    getClosestFolder(assetPath) {
        const {assets: {userAssets}} = this.props
        const folder = userAssets.find(({path, type}) => type === 'Folder' && path.join('/') === assetPath.join('/'))
        if (folder) {
            return folder.path
        } else {
            const parentPath = assetPath.slice(0, -1)
            return parentPath.length
                ? this.getClosestFolder(parentPath)
                : ''
        }
    }

    getParentFolderId(assetId) {
        const index = assetId.lastIndexOf('/')
        return assetId.substr(0, index)
    }

    componentDidMount() {
        const {assets: {tree}, activatable: {activatables: {assetBrowser: {activationProps: {assetId}}}}} = this.props
        this.updateTree(tree)
        this.updateAsset(assetId)
    }

    componentDidUpdate({assets: {tree: prevTree}}, {filter: prevFilter}) {
        const {assets: {tree}} = this.props
        const {filter} = this.state
        if (filter !== prevFilter || !isEqual(prevTree, tree)) {
            this.updateTree(tree)
        }
    }
}

const policy = () => ({
    _: 'allow'
})

export const AssetDestinationBrowser = compose(
    _AssetDestinationBrowser,
    withForm({fields, mapStateToProps}),
    withAssets(),
    withActivatable({id: 'assetBrowser', policy, alwaysAllow: true})
)

AssetDestinationBrowser.propTypes = {
    onChange: PropTypes.func.isRequired,
    assetId: PropTypes.string
}
