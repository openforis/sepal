export class DataCollectionEvents {
    listeners = []

    select(point) {
        this.listeners.forEach(({onSelect}) => onSelect && onSelect(point))
    }

    deselect(point) {
        this.listeners.forEach(({onDeselect}) => onDeselect && onDeselect(point))
    }

    add(point, prevValue) {
        this.listeners.forEach(({onAdd}) => onAdd && onAdd(point, prevValue))
    }

    update(point, prevValue) {
        this.listeners.forEach(({onUpdate}) => onUpdate && onUpdate(point, prevValue))
    }

    remove(point) {
        this.listeners.forEach(({onRemove}) => onRemove && onRemove(point))
    }

    updateAll() {
        this.listeners.forEach(({onUpdateAll}) => onUpdateAll && onUpdateAll())
    }

    addListener({onSelect, onDeselect, onAdd, onUpdate, onRemove, onUpdateAll}) {
        this.listeners.push({onSelect, onDeselect, onAdd, onUpdate, onRemove, onUpdateAll})
    }
}
