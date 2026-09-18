import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {ListItem} from '~/widget/listItem'

import styles from './folderItem.module.css'

// Direct children only, so what the row claims and what removal allows never disagree.
const description = ({folders, recipes}) =>
    [
        folders ? msg('process.folder.folderCount', {count: folders}) : null,
        msg('process.folder.description', {count: recipes})
    ].filter(part => part).join(' · ')

export const FolderItem = ({folder, counts, highlight, hovered, onClick, onEdit, onRemove}) =>
    <ListItem
        hovered={hovered}
        onClick={() => onClick(folder)}>
        <CrudItem
            icon='folder-open'
            iconClassName={styles.icon}
            iconSize='lg'
            title={folder.name}
            description={description(counts)}
            highlight={highlight}
            editTooltip={msg('process.folder.edit.tooltip')}
            removeTooltip={msg('process.folder.remove.tooltip')}
            removeTitle={msg('process.folder.remove.title')}
            removeMessage={msg('process.folder.remove.confirm')}
            onEdit={onEdit ? () => onEdit(folder) : undefined}
            onRemove={onRemove ? () => onRemove(folder) : undefined}
        />
    </ListItem>

FolderItem.propTypes = {
    counts: PropTypes.object.isRequired,
    folder: PropTypes.object.isRequired,
    onClick: PropTypes.func.isRequired,
    highlight: PropTypes.any,
    hovered: PropTypes.any,
    onEdit: PropTypes.func,
    onRemove: PropTypes.func
}
