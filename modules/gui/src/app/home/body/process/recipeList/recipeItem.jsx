import PropTypes from 'prop-types'

import {msg} from '~/translate'
import {CrudItem} from '~/widget/crudItem'
import {ListItem} from '~/widget/listItem'

export const RecipeItem = ({
    recipe, typeName, path, highlight, hovered, edit, selected, drag$,
    onClick, onSelect, onDuplicate, onRemove
}) =>
    <ListItem
        hovered={hovered}
        drag$={drag$ || undefined}
        dragValue={{kind: 'recipe', id: recipe.id, folderId: recipe.folderId}}
        dragPointer='mouse'
        showDragHandle={false}
        onClick={() => edit ? onSelect(recipe.id) : onClick(recipe)}>
        <CrudItem
            icon='globe'
            iconSize='lg'
            title={recipe.name}
            description={[path, typeName].filter(part => part).join(' · ')}
            timestamp={recipe.updateTime}
            highlight={highlight}
            duplicateTooltip={msg('process.menu.duplicateRecipe.tooltip')}
            removeTooltip={msg('process.menu.removeRecipe.tooltip')}
            selectTooltip={msg('process.menu.selectRecipe.tooltip')}
            selected={edit ? selected : undefined}
            onDuplicate={!edit && onDuplicate ? () => onDuplicate(recipe.id) : undefined}
            onRemove={!edit && onRemove ? () => onRemove(recipe.id) : undefined}
            onSelect={edit ? () => onSelect(recipe.id) : undefined}
        />
    </ListItem>

RecipeItem.propTypes = {
    recipe: PropTypes.object.isRequired,
    onClick: PropTypes.func.isRequired,
    drag$: PropTypes.object,
    edit: PropTypes.bool,
    highlight: PropTypes.any,
    hovered: PropTypes.any,
    onDuplicate: PropTypes.func,
    onRemove: PropTypes.func,
    onSelect: PropTypes.func,
    path: PropTypes.string,
    selected: PropTypes.bool,
    typeName: PropTypes.string
}
