import 'todomvc-app-css/index.css'
import './todo-list.tag'
import './todo-footer.tag'
import './todo-input.tag'
import deps from 'dependencies'

<todo-app>
	<section class="todoapp">
		<header class="header">
			<h1>todos</h1>
			<todo-input></todo-input>
		</header>
		<todo-list if={!empty}></todo-list>
		<todo-footer if={!empty}></todo-footer>
	</section>

	<footer class="info">
		<p>Double-click to edit a todo</p>
		<!-- Change this out with your name and url ↓ -->
		<p>Created by <a href="http://todomvc.com">you</a></p>
		<p>Part of <a href="http://todomvc.com">TodoMVC</a></p>
	</footer>

	this.empty = deps.todoStore.isEmpty()
	deps.dispatcher.on('todo:list-updated', () => {
		this.empty = deps.todoStore.isEmpty()
		this.update()
	})
</todo-app>