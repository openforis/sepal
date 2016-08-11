/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var Container = null
var UsersList = null
var RowHeader = null
var RowUser   = null

var selectedUser = null

var init = function ( container ) {
    Container = container
    
    UsersList = Container.find( '.users-list' )
    RowHeader = Container.find( '.row-header' )
    RowUser   = Container.find( '.row-user' )
}

var interval       = null
var stopUpdateList = function () {
    clearInterval( interval )
    interval = null
}
var setUsers       = function ( users ) {
    if ( interval ) {
        
        stopUpdateList()
        setUsers( users )
        
    } else {
        
        var idx = 0
        UsersList.empty()
        
        if ( users && users.length > 0 ) {
            RowHeader.show()
            
            var addUser = function () {
                var user = users[ idx ]
                
                var row = getListSectionUserRow( user )
                UsersList.append( row )
                row.show( 0 )
                
                idx++
                if ( idx === users.length ) {
                    stopUpdateList()
                }
            }
            
            interval = setInterval( addUser, 100 )
            
        } else {
            RowHeader.hide()
        }
    }
}

var getListSectionUserRow = function ( user ) {
    var row = RowUser.clone()
    row.addClass( 'row-user-' + user.id )
    
    if ( selectedUser && selectedUser.id === user.id ) {
        row.addClass( 'active' )
    }
    
    row.find( '.name' ).html( user.name )
    row.find( '.username' ).html( user.username )
    row.find( '.status' ).html( user.status )
    
    row.click( function ( e ) {
        e.preventDefault()
        
        var selectedUser = row.hasClass( 'active' ) ? null : user
        
        EventBus.dispatch( Events.SECTION.USERS.SELECT_USER, null, selectedUser )
    } )
    
    return row
}

var selectUser = function ( user ) {
    selectedUser = user
    UsersList.find( '.row-user.active' ).removeClass( 'active' )
    if ( user ) {
        UsersList.find( '.row-user.row-user-' + user.id ).addClass( 'active' )
    }
}

module.exports = {
    init        : init
    , setUsers  : setUsers
    , selectUser: selectUser
}