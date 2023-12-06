import {AssetItem} from './assetItem'
import {Button} from './button'
import {Input} from './input'
import {ScrollableList} from './list'
import {Widget} from './widget'
import {compose} from 'compose'
import {withAssets} from './assets'
import PropTypes from 'prop-types'
import React from 'react'
import _ from 'lodash'
import styles from './assetLocation.module.css'

class _AssetLocation extends React.Component {
    constructor(props) {
        super(props)
        this.onInputChange = this.onInputChange.bind(this)
        this.onTreeSelect = this.onTreeSelect.bind(this)
    }

    input = React.createRef()

    state = {
        selectedId: null
    }

    render() {
        const {assets: {tree}, className, label, labelButtons, tooltip, tooltipPlacement, disabled, errorMessage} = this.props
        const folderOptions = this.getFolderOptions(tree)
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
                {this.renderTree(folderOptions)}
            </Widget>
        )
    }

    renderInput() {
        const {value} = this.props
        return (
            <Input
                ref={this.input}
                value={value}
                autoFocus
                onChange={this.onInputChange}
            />
        )
    }

    renderTree(options) {
        const {selectedId} = this.state
        return (
            <ScrollableList
                options={options}
                selectedValue={selectedId}
                onSelect={this.onTreeSelect}
                tooltipPlacement='bottomRight'
                keyboard={false}
            />
        )
    }

    renderItem({id, type, depth, tooltip}) {
        const showTailOnly = depth > 0 || type !== 'Folder'
        return (
            <AssetItem
                key={id}
                id={id}
                type={type}
                tail={showTailOnly}
                inlineComponents={[
                    this.renderButton(tooltip)
                ]}
            />
        )
    }

    renderButton(tooltip) {
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

    getFolderOptions({items} = {}, depth = 0) {
        return _(items)
            .pickBy(node => node.props.type === 'Folder')
            .map((node, id) => [
                this.getItemOption({id, type: node.props.type, depth, node}),
                this.getFolderOptions(node, depth + 1)
            ])
            .flattenDeep()
            .value()
    }

    getAssetOptions({items} = {}) {
        return _(items)
            .pickBy(node => node.props.type !== 'Folder')
            .map((node, id) => this.getItemOption({id, type: node.props.type}))
            .value()
    }

    renderFileList(folder) {
        const {selectedId} = this.state
        const options = this.getAssetOptions(folder)
        return options.length
            ? (
                <ScrollableList
                    className={styles.fileList}
                    options={options}
                    selectedValue={selectedId}
                    onSelect={this.onTreeSelect}
                    tooltipPlacement='bottomRight'
                    keyboard={false}
                />
            )
            : null
    }

    getItemOption({id, type, depth, node}) {
        const tooltip = this.renderFileList(node)
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
    
    onTreeSelect({value}) {
        const {onChange} = this.props
        onChange && onChange(value)
        this.focusInput()
    }

    focusInput() {
        this.input?.current.focus()
    }

    getClosestFolderId(assetId) {
        const {assets: {userAssets}} = this.props
        const folder = userAssets.find(({id, type}) => type === 'Folder' && assetId === id)
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

    componentDidMount() {
        const {value} = this.props
        this.update(value)
    }

    componentDidUpdate({value: prevValue}) {
        const {value} = this.props
        if (value !== prevValue) {
            this.update(value)
        }
    }

    update(value) {
        this.setState({selectedId: this.getClosestFolderId(value)})
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
