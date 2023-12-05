import {AssetItem} from './assetItem'
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
        const folderOptions = _.flattenDeep(this.getFolderOptions(tree))
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
                className={styles.tree}
                options={options}
                selectedValue={selectedId}
                onSelect={this.onTreeSelect}
                tooltipPlacement='bottomRight'
                keyboard={false}
            />
        )
    }

    renderItem({id, type, depth}) {
        return (
            <AssetItem
                key={id}
                id={id}
                type={type}
                short={depth > 0}
            />
        )
    }

    getFolderOptions({items} = {}, depth = 0) {
        return _(items)
            .map((node, id) =>
                node.props.type === 'Folder'
                    ? [
                        this.getItemOption({id, type: node.props.type, depth, node}),
                        this.getFolderOptions(node, depth + 1)
                    ]
                    : []
            )
            .value()
    }

    getAssetOptions({items} = {}) {
        return _(items)
            .map((node, id) =>
                node.props.type !== 'Folder'
                    ? this.getItemOption({id, type: node.props.type})
                    : []
            )
            .value()
    }

    getItemOption({id, type, depth, node}) {
        const render = () => this.renderItem({id, type, depth})
        const tooltip = node
            ? () => this.renderTree(_.flattenDeep(this.getAssetOptions(node)), true)
            : null
        return {
            label: id,
            value: id,
            indent: depth,
            render,
            tooltip
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

    getClosestParent(assetId) {
        const {assets: {userAssets}} = this.props
        const asset = userAssets.find(({id, type}) => type === 'Folder' && assetId === id)
        if (asset) {
            return asset.id
        } else {
            const parentId = this.getParentId(assetId)
            return parentId.length
                ? this.getClosestParent(parentId)
                : ''
        }
    }

    getParentId(assetId) {
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
        this.setState({selectedId: this.getClosestParent(value)})
    }
}

export const AssetLocation = compose(
    _AssetLocation,
    withAssets()
)

AssetLocation.propTypes = {
    className: PropTypes.string,
    disabled: PropTypes.any,
    errorMessage: PropTypes.any,
    label: PropTypes.any,
    labelButtons: PropTypes.any,
    tooltip: PropTypes.any,
    tooltipPlacement: PropTypes.string,
    value: PropTypes.any,
    onChange: PropTypes.func
}
