export class DataCollectionEvents {
    listeners = []

    deselect(point) {
        this.listeners.forEach(({onDeselect}) => onDeselect && onDeselect(point))
    }

    update(point) {
        this.listeners.forEach(({onUpdate}) => onUpdate && onUpdate(point))
    }

    remove(point) {
        this.listeners.forEach(({onRemove}) => onRemove && onRemove(point))
    }

    updateDataSet(dataSetId) {
        this.listeners.forEach(({onDataSetUpdate}) => onDataSetUpdate && onDataSetUpdate(dataSetId))
    }

    addListener({onDeselect, onUpdate, onRemove, onDataSetUpdate}) {
        this.listeners.push({onDeselect, onUpdate, onRemove, onDataSetUpdate})
    }
}
