/**
 * @author Mino Togna
 */
var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )
var UserM    = require( '../../user/user-m' )


var Container = null
var UsersList = null
var RowHeader = null
var RowUser   = null

var selectedUser = null

var init = function ( container ) {
    selectedUser = null
    
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
                
                var row = getUserRow( user )
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

var getUserRow = function ( user ) {
    var row = RowUser.clone()
    row.addClass( 'row-user-' + user.id )
    
    if ( selectedUser && selectedUser.id === user.id ) {
        row.addClass( 'active' )
    }
    
    var name = ( user.isAdmin() ? '<i class="fa fa-user-secret p-r-0-5" aria-hidden="true"></i> ' : ' ' ) + user.name
    row.find( '.name' ).html( name )
    
    row.find( '.username' ).html( user.username )
    
    var status = ''
    switch ( user.status ) {
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
    
    if ( user.sandboxReport ) {
        row.find( '.monthlyInstanceBudget' ).html( user.sandboxReport.monthlyInstanceBudget )
        row.find( '.monthlyInstanceSpending' ).html( user.sandboxReport.monthlyInstanceSpending )
        row.find( '.monthlyStorageBudget' ).html( user.sandboxReport.monthlyStorageBudget )
        row.find( '.monthlyStorageSpending' ).html( user.sandboxReport.monthlyStorageSpending )
        row.find( '.storageQuota' ).html( user.sandboxReport.storageQuota )
        row.find( '.storageUsed' ).html( user.sandboxReport.storageUsed )
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