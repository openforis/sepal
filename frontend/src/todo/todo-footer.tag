import deps from 'dependencies'

<todo-footer>
	<footer class="footer">
		<span class="todo-count"><strong>{itemsLeftCount}</strong> {itemLabel} left</span>
		<ul class="filters">
			<li>
				<a class="{selected: !filter}" href="#/">All</a>
			</li>
			<li>
				<a class="{selected: filter === 'active'}" href="#/active">Active</a>
			</li>
			<li>
				<a class="{selected: filter === 'completed'}" href="#/completed">Completed</a>
			</li>
		</ul>
		<button if={hasCompleted} class="clear-completed" onclick={clearCompleted}>Clear completed</button>
	</footer>

	this.init = () => {
		this.itemsLeftCount = deps.todoStore.itemsLeftCount()
		this.itemLabel = this.left == 1 ? 'item' : 'items'
		this.hasCompleted = deps.todoStore.hasCompleted()
	}

	this.clearCompleted = () => {
		deps.dispatcher.trigger('todo:clear-completed')
	}

	deps.dispatcher.on('todo:list-updated',  () => {
		this.init()
		this.update()
	})

	deps.dispatcher.on('todo:filtered', (filter) => {
		this.filter = filter
		this.update()
	})
	
	this.init()
</todo-footer>