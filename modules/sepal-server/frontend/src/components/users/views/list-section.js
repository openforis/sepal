/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container   = null
var ListActions = require( './list-actions' )
var List        = require( './list' )
var ListSummary = require( './list-summary' )

var init = function ( container ) {
    Container = $( container )
    
    ListActions.init( Container.find( '.actions' ) )
    List.init( Container.find( '.list' ) )
    ListSummary.init( Container.find( '.summary' ) )
}

var setUsers = function ( users ) {
    List.setUsers( users )
    ListSummary.setUsers( users )
}

var selectUser = function ( user ) {
    ListActions.selectUser( user )
    List.selectUser( user )
}

var getContainer = function () {
    return Container
}

module.exports = {
    init          : init
    , setUsers    : setUsers
    , selectUser  : selectUser
    , getContainer: getContainer
}
