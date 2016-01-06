import _ from 'lodash'
import $ from 'jquery'

        export default class DownloadRequestsStore {
        constructor(dispatcher, storage) {
            this._dispatcher = dispatcher
            this._storage = storage

            this._load()
        }
        
        downloads(){
        	return this._downloads;
        }



    _load() {
    	$.getJSON('/data/downloadRequests/79', (downloads) => {
            this._downloads = downloads;
            this._dispatcher.trigger('downloads:list-updated');
        });
    }

    
}
