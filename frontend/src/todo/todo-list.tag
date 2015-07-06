import './todo-item.tag'
import deps from 'dependencies'

<todo-list>
	<section class="main">
		<input class="toggle-all" type="checkbox" onclick={toggleAll} checked={allCompleted}>
		<label for="toggle-all">Mark all as complete</label>
		<ul class="todo-list">
			<todo-item each={ todo in todos } data={todo}></todo>
		</ul>
	</section>

	this.todos = deps.todoStore.todos(this.filter)

	this.toggleAll = () => {
		deps.dispatcher.trigger('todo:toggle-all')
	}

	this.init = () => {
		this.todos = deps.todoStore.todos(this.filter)
		this.allCompleted = deps.todoStore.allCompleted()
		this.update()
	}

	deps.dispatcher.on('todo:list-updated', () => this.init())

	deps.dispatcher.on('todo:filtered', (filter) => {
		this.filter = filter
		this.todos = deps.todoStore.todos(filter)
		this.update()
	})

	this.init()
</todo-list>