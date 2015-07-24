import _ from 'lodash'
import $ from 'jquery'

        export default class TodoStore {
        constructor(dispatcher, storage) {
            this._dispatcher = dispatcher
            this._storage = storage
            dispatcher.on('todo:add', title => this._add(title))
            dispatcher.on('todo:update', todo => this._update(todo))
            dispatcher.on('todo:remove', todo => this._remove(todo))
            dispatcher.on('todo:toggle-all', () => this._toggleAll())
            dispatcher.on('todo:clear-completed', () => this._clearCompleted())
            dispatcher.on('todo:filter', (filter) => dispatcher.trigger('todo:filtered', filter))

            this._load()
        }

        todos(filter) {
            let todos = _.values(this._todos)
            if (filter === 'active')
                todos = _.filter(todos, todo => {
                    return !todo.completed
                })
            else if (filter === 'completed')
                todos = _.filter(todos, todo => {
                    return todo.completed
                })
            return todos
        }

    isEmpty() {
        return _.isEmpty(this._todos)
    }

    itemsLeftCount() {
        const left = _.filter(this._todos, todo => !todo.completed)
        return left.length
    }

    hasCompleted() {
        return _.some(this._todos, todo => todo.completed)
    }

    allCompleted() {
        return _.every(this._todos, todo => todo.completed)
    }

    _add(title) {
        const todo = {id: this._uuid(), title: title, completed: false, timestamp: new Date().getTime()}
        this._todos[todo.id] = todo
        this._save()
        this._dispatcher.trigger('todo:list-updated')
    }

    _update(todo) {
        this._todos[todo.id] = todo
        this._save()
        this._dispatcher.trigger('todo:list-updated')
    }

    _remove(todo) {
        delete this._todos[todo.id]
        this._save()
        this._dispatcher.trigger('todo:list-updated')
    }

    _toggleAll() {
        const allCompleted = this.itemsLeftCount() > 0
        _.each(this._todos, todo => {
            todo.completed = allCompleted
        })
        this._save()
        this._dispatcher.trigger('todo:list-updated')
    }

    _clearCompleted() {
        _.each(this._todos, todo => {
            if (todo.completed)
                delete this._todos[todo.id]
        })
        this._save()
        this._dispatcher.trigger('todo:list-updated')
    }

    _setFilter(filter) {
        this._filter = filter
        this._save()
        this._dispatcher.trigger('todo:filtered', filter)
    }

    _save() {
        $.ajax({
            type: 'POST',
            url: '/data/todos/someUser',
            data: JSON.stringify(this._todos)
        })
    }

    _load() {
        $.getJSON('/data/todos/someUser', (todos) => {
            this._todos = todos
            this._dispatcher.trigger('todo:list-updated')
        });
    }

    _uuid() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8)
            return v.toString(16)
        })
    }
}
