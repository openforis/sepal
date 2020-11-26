export class DataCollectionEvents {
    listeners = []

    deselect(point) {
        this.listeners.forEach(({onDeselect}) => onDeselect && onDeselect(point))
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

    addListener({onDeselect, onUpdate, onRemove, onUpdateAll}) {
        this.listeners.push({onDeselect, onUpdate, onRemove, onUpdateAll})
    }
}
