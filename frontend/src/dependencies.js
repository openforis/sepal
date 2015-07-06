import dispatcher from 'util/dispatcher'
import DownloadRequestsStore from 'requestsdashboard/downloadRequestsStore'
import TodoStore from 'todo/todoStore'


const dependencies = {
	dispatcher: dispatcher,
	//todoStore: new TodoStore(dispatcher, window.localStorage),
	downloadRequestsStore: new DownloadRequestsStore(dispatcher,window.localStorage)
}
export default dependencies
