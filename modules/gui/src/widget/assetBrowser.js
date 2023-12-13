import {AssetItem} from './assetItem'
import {Button} from './button'
import {Form, withForm} from 'widget/form/form'
import {Input} from './input'
import {Panel} from './panel/panel'
import {ScrollableList} from './list'
import {SearchBox} from './searchBox'
import {Tree} from 'tree'
import {Widget} from './widget'
import {compose} from 'compose'
import {isEqual} from 'hash'
import {isMobile} from './userAgent'
import {isServiceAccount} from 'user'
import {msg} from 'translate'
import {withActivatable} from './activation/activatable'
import {withAssets} from './assets'
import ButtonPopup from './buttonPopup'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './assetBrowser.module.css'

const fields = {
    asset: new Form.Field().notBlank()
}

const isFolder = type => type === 'Folder'

const mapStateToProps = (_state, ownProps) => ({
    values: {
        asset: ownProps?.assetId || ownProps?.activatable?.activatables?.assetBrowser?.activationProps?.assetId
    }
})

class _AssetBrowser extends React.Component {
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
        filteredTree: Tree.createNode(),
        selectedFolderId: null,
        selectedParentPath: null
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
        const {selectedParentPath} = this.state
        return (
            <ButtonPopup
                look='add'
                icon='plus'
                label={msg('Create folder')}
                vPlacement='below'
                hPlacement='over-right'
                disabled={!selectedParentPath}
            >
                {close => (
                    <Input
                        autoFocus
                        placeholder={msg('Enter folder name')}
                        onAccept={folder => {
                            this.onCreateFolder(folder)
                            close()
                        }}
                        onCancel={close}
                    />
                )}
            </ButtonPopup>
        )
    }

    onCreateFolder(folder) {
        const {assets: {createFolder}} = this.props
        const {selectedParentPath} = this.state
        createFolder(selectedParentPath, folder)
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
        const {filteredTree, selectedFolderId} = this.state
        const options = this.getFolderTreeOptions(filteredTree)
        return (
            <ScrollableList
                options={options}
                selectedValue={selectedFolderId}
                onSelect={this.onFolderSelect}
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
                    keyboard={false}
                    onSelect={asset => {
                        this.onAssetSelect(asset)
                        close()
                    }}
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
                icon='bars'
                dimmed
                tooltip={tooltip}
                tooltipPlacement={isMobile() ? 'bottomRight' : 'bottomLeft'}
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

    getFolderTreeOptions({items} = {}, depth = 0) {
        return _(items)
            .pickBy(node => isFolder(node.props.type))
            .map((node, id) => [
                this.getItemOption({path: node.path, id, type: node.props.type, depth, node}),
                ...this.getFolderTreeOptions(node, depth + 1)
            ])
            .flatten()
            .value()
    }

    getFolderAssetsOptions({items} = {}) {
        return _(items)
            .pickBy(node => !isFolder(node.props.type))
            .map((node, id) => this.getItemOption({path: node.path, id, type: node.props.type}))
            .value()
    }

    getItemOption({path, id, type, depth, node}) {
        const tooltip = this.renderFolderAssets(node)
        const render = () => this.renderItem({id, type, depth, tooltip})
        return {
            label: id,
            value: id,
            path,
            indent: depth,
            render
        }
    }

    getFilter() {
        const {filter} = this.state
        return id => id ? id.toLowerCase().includes(filter.toLowerCase()) : true
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

    getCurrentAssetName() {
        const {inputs: {asset: {value: assetId}}} = this.props
        const index = assetId.lastIndexOf('/')
        return assetId.substr(index + 1)
    }

    onInputChange({target: {value: assetId}}) {
        this.updateAsset(assetId)
    }

    onFolderSelect({value: folderAssetId, path}) {
        this.updateAsset(`${folderAssetId}/${this.getCurrentAssetName()}`, path)
        this.focusInput()
    }
    
    onAssetSelect({value: assetId, path}) {
        this.updateAsset(assetId, path)
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
        this.setState({filteredTree: Tree.filter(tree, this.getFilter())})
    }

    updateAsset(assetId, parent) {
        const {inputs: {asset}} = this.props
        asset.set(assetId)
        this.setState({
            selectedFolderId: this.getClosestFolderId(assetId),
            selectedParentPath: parent
        })
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

export const AssetBrowser = compose(
    _AssetBrowser,
    withForm({fields, mapStateToProps}),
    withAssets(),
    withActivatable({id: 'assetBrowser', policy, alwaysAllow: true})
)

AssetBrowser.propTypes = {
    onChange: PropTypes.func.isRequired,
    assetId: PropTypes.string
}
