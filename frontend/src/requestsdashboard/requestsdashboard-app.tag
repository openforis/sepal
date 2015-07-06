import 'todomvc-app-css/index.css'
import './requestsdashboard-item.tag'
import deps from 'dependencies'


<requestsdashboard-app>
	<section class="main">
		<ul class="requests-list">
			<requestsdashboard-item each={request in requests} data={request} />
		</ul>
	</section>
	
	this.requests = deps.downloadRequestsStore.downloads();
	
	deps.dispatcher.on('downloads:list-updated', () => {
		this.requests = deps.downloadRequestsStore.downloads();
		this.update();
	})
	
</requestsdashboard-app>
