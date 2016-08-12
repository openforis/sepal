/**
 * @author Mino Togna
 */

var UserM = require( '../user/user-m' )

var users        = null
var selectedUser = null

var setUsers = function ( usersDetails ) {
    users = []
    $.each( usersDetails, function ( i, userDetail ) {
        var user = UserM( userDetail )
        users.push( user )
    } )
}

var filterUsers = function ( searchString ) {
    if ( $.isEmptyString( searchString ) ) {
        
        return users
        
    } else {
        
        searchString = $.trim( searchString ).toLowerCase()
        
        var filterUser = function ( user ) {
            var match = false
            if (
                $.containsString( user.name.toLowerCase(), searchString )
                || $.containsString( user.username.toLowerCase(), searchString )
            // || $.containsString( user.status.toLowerCase(), searchString )
            ) {
                match = true
            }
            return match
        }
        
        return users.filter( filterUser )
        
    }
}

var getSelectedUser = function () {
    return selectedUser
}

var setSelectedUser = function ( user ) {
    selectedUser = user
}

module.exports = {
    setUsers         : setUsers
    , filterUsers    : filterUsers
    , getSelectedUser: getSelectedUser
    , setSelectedUser: setSelectedUser
}