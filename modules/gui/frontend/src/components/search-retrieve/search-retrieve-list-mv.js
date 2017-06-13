/**
 * @author Mino Togna
 */

var EventBus = require('../event/event-bus')
var Events   = require('../event/events')
// var View     = require( './search-retrieve-v' )
// var Model    = require( '../search/model/search-model' )

var saveActive = function (e, state) {
  
  var params = {
    url      : '/api/mosaics/' + state.id + '/save'
    , data   : {data: JSON.stringify(state)}
    , success: function (response) {
      EventBus.dispatch(Events.SECTION.SEARCH.STATE.LIST_CHANGE, null, response)
    }
  }
  
  EventBus.dispatch(Events.AJAX.POST, null, params)
}

EventBus.addEventListener(Events.SECTION.SEARCH.STATE.ACTIVE_SAVE, saveActive)