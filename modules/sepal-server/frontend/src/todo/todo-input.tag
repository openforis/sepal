import deps from 'dependencies'
import Keys from './keys'

<todo-input>
    <input class="new-todo" placeholder="What needs to be done?" autofocus onkeydown={keyDown}>

	this.keyDown = e => {
		if (e.keyCode === Keys.ENTER)
			this.addTodo(e.target)
		else	
			return true
	}

	this.addTodo = input => {
		const title = input.value.trim()
		if (title) {
			deps.dispatcher.trigger('todo:add', title)
			input.value = ''
		}
	}
</todo-input>