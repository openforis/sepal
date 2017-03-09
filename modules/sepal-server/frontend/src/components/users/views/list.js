/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var ListSort = require( './list-sort' )

var Container = null
var usersList = null
var rowHeader = null
var rowUser   = null

var selectedUser = null

var init = function ( container ) {
    selectedUser = null
    
    Container = container
    
    usersList = Container.find( '.users-list' )
    rowHeader = Container.find( '.row-header' )
    rowUser   = Container.find( '.row-user' )
    
    ListSort.init( rowHeader )
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
        usersList.empty()
        
        if ( users && users.length > 0 ) {
            rowHeader.show()
            
            var addUser = function () {
                var user = users[ idx ]
                
                var row = getUserRow( user )
                usersList.append( row )
                row.show( 0 )
                
                idx++
                if ( idx === users.length ) {
                    stopUpdateList()
                }
            }
            
            interval = setInterval( addUser, 100 )
            
        } else {
            rowHeader.hide()
        }
    }
}

var getUserRow = function ( user ) {
    var row = rowUser.clone()
    row.addClass( 'row-user-' + user.id )
    
    if ( selectedUser && selectedUser.id === user.id ) {
        row.addClass( 'active' )
    }
    
    var name = ( user.isAdmin() ? '<i class="fa fa-user-secret p-r-0-5" aria-hidden="true"></i> ' : ' ' ) + user.name
    row.find( '.name' ).html( name )
    
    row.find( '.username' ).html( user.username )
    
    var status = ''
    switch ( user.status.toLowerCase() ) {
        case 'locked':
            status = '<i class="fa fa-lock" aria-hidden="true"></i>'
            // status = '<i class="fa fa-frown-o" aria-hidden="true"></i>'
            break
        case 'pending':
            status = '<i class="fa fa-meh-o" aria-hidden="true"></i>'
            break
        case 'active':
            status = '<i class="fa fa-smile-o" aria-hidden="true"></i>'
            break
        default:
            status = '<i class="fa fa-smile-o" aria-hidden="true"></i>'
        // status = '<i class="fa fa-lock" aria-hidden="true"></i>'
        
    }
    row.find( '.status' ).html( status )
    
    var spending = user.getSpending()
    if ( spending ) {
        row.find( '.monthlyInstanceBudget' ).html( spending.monthlyInstanceBudget )
        row.find( '.monthlyInstanceSpending' ).html( spending.monthlyInstanceSpending )
        row.find( '.monthlyStorageBudget' ).html( spending.monthlyStorageBudget )
        row.find( '.monthlyStorageSpending' ).html( spending.monthlyStorageSpending )
        row.find( '.storageQuota' ).html( spending.storageQuota )
        row.find( '.storageUsed' ).html( spending.storageUsed )
    }
    
    row.click( function ( e ) {
        e.preventDefault()
        
        var selectedUser = row.hasClass( 'active' ) ? null : user
        EventBus.dispatch( Events.SECTION.USERS.SELECT_USER, null, selectedUser )
    } )
    
    return row
}

var selectUser = function ( user ) {
    selectedUser = user
    usersList.find( '.row-user.active' ).removeClass( 'active' )
    if ( user ) {
        usersList.find( '.row-user.row-user-' + user.id ).addClass( 'active' )
    }
}

module.exports = {
    init        : init
    , setUsers  : setUsers
    , selectUser: selectUser
}