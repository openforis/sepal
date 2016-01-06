import deps from 'dependencies'
import Keys from './keys'

<todo-item>
	<li class="{completed: todo.completed, editing: editing}">
		<div class="view">
			<input class="toggle" type="checkbox" checked={todo.completed} onclick={toggleCompleted}>
			<label ondblclick={edit}>{todo.title}</label>
			<button class="destroy" onclick={remove}></button>
		</div>
		<input show={editing} class="edit" name="input" value="{todo.title}" 
			   onblur={updateTitle} onkeydown={keyDown}>
	</li>


	this.toggleCompleted = () => {
		this.todo.completed = !this.todo.completed
		deps.dispatcher.trigger('todo:update', this.todo)
	}

	this.remove = () => {
		deps.dispatcher.trigger('todo:remove', this.todo)
	}

	this.edit = () => {
		this.editing = true
		this.input.style.display = "inherit"
		this.input.focus()
	} 

	this.keyDown = (e) => {
		const key = e.keyCode
		if (key === Keys.ENTER)
			this.updateTitle()
		else if (key === Keys.ESCAPE)
			this.cancel()
		else
			return true
	}

	this.updateTitle = () => {
		const title = this.input.value.trim()
		if (title) {
			this.todo.title = title
			deps.dispatcher.trigger('todo:update', this.todo)
		} else
			this.remove()
		this.editing = false
	}

	this.cancel = () => {
		this.editing = false
		this.input.value = this.todo.title
	}
</todo-item>