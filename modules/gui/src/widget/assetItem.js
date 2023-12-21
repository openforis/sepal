import {CrudItem} from 'widget/crudItem'
import {msg} from 'translate'
import PropTypes from 'prop-types'
import React from 'react'

export class AssetItem extends React.Component {
    render() {
        const {title, id, type, highlightMatcher, inlineComponents} = this.props
        return (
            <CrudItem
                key={id}
                description={title || this.getId(id)}
                highlight={highlightMatcher}
                icon={this.getItemTypeIcon(type)}
                iconTooltip={this.getItemTooltip(type)}
                iconVariant={['Folder', 'NewFolder'].includes(type) ? 'info' : null}
                iconDimmed={type === 'NewFolder'}
                inlineComponents={inlineComponents}
            />
        )
    }

    getId() {
        const {id, tail} = this.props
        return tail
            ? this.getLastPathSection(id)
            : id
    }

    getLastPathSection(path) {
        const index = path.lastIndexOf('/')
        return path.substr(index + 1)
    }

    getItemTypeIcon(type) {
        const ASSET_ICON = {
            NewFolder: 'folder-open',
            Folder: 'folder-open',
            Image: 'image',
            ImageCollection: 'images',
            Table: 'table'
        }
        return ASSET_ICON[type] || 'asterisk'
    }
    
    getItemTypeIconVariant(type) {
        const ASSET_ICON_VARIANT = {
            NewFolder: 'success',
            Folder: 'info'
        }
        return ASSET_ICON_VARIANT[type]
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

}

AssetItem.propTypes = {
    highlightMatcher: PropTypes.string,
    id: PropTypes.string,
    inlineComponents: PropTypes.array,
    tail: PropTypes.any,
    title: PropTypes.string,
    type: PropTypes.string,
    url: PropTypes.string
}
