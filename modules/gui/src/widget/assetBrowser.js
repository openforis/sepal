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
import {msg} from 'translate'
import {withActivatable} from './activation/activatable'
import {withAssets} from './assets'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './assetBrowser.module.css'

const fields = {
    assetId: new Form.Field().notBlank()
}

const isFolder = type => type === 'Folder'

class _AssetBrowser extends React.Component {
    constructor(props) {
        super(props)
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
        selectedFolderId: null
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
                <Panel.Header title={msg('asset.browser.title')}/>
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
                <Form.PanelButtons/>
            </Form.Panel>
        )
    }

    renderInput() {
        const {form, inputs: {assetId}} = this.props
        return (
            <Input
                ref={this.input}
                errorMessage={form.getErrorMessage(assetId)}
                value={assetId.value}
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
                tooltipPlacement='bottomRight'
                keyboard={false}
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
        const {inputs: {assetId}} = this.props
        const index = assetId.value.lastIndexOf('/')
        return assetId.value.substr(index + 1)
    }

    onInputChange(e) {
        const value = e.target.value
        this.updateAsset(value)
    }

    onFolderSelect({value: folderAssetId}) {
        this.updateAsset(`${folderAssetId}/${this.getCurrentAssetName()}`)
        this.focusInput()
    }
    
    onAssetSelect({value: assetId}) {
        this.updateAsset(assetId)
        this.focusInput()
    }

    onFilterChange(filter) {
        this.setState({filter})
    }

    onApply() {
        const {inputs: {assetId}, onChange, activatable: {deactivate}} = this.props
        onChange && onChange(assetId.value)
        deactivate()
    }

    focusInput() {
        this.input?.current.focus()
    }

    updateTree(tree) {
        this.setState({filteredTree: Tree.filter(tree, this.getFilter())})
    }

    updateAsset(value) {
        const {inputs: {assetId}} = this.props
        assetId.set(value)
        this.setState({selectedFolderId: this.getClosestFolderId(value)})
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
    withForm({fields}),
    withAssets(),
    withActivatable({id: 'assetBrowser', policy, alwaysAllow: true})
)

AssetBrowser.propTypes = {
    onChange: PropTypes.func.isRequired,
    assetId: PropTypes.string
}
