export class DataCollectionEvents {
    listeners = []

    deselect(point) {
        this.listeners.forEach(({onDeselect}) => onDeselect(point))
    }

    update(point) {
        this.listeners.forEach(({onUpdate}) => onUpdate(point))
    }

    remove(point) {
        this.listeners.forEach(({onRemove}) => onRemove(point))
    }

    addListener({onDeselect, onUpdate, onRemove}) {
        this.listeners.push({onDeselect, onUpdate, onRemove})
    }
}
