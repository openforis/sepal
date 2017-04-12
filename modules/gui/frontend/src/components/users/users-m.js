/**
 * @author Mino Togna
 */
var UserM       = require( '../user/user-m' )
var UsersFilter = require( './users-filter' )

var users        = null
var userBudgets  = null
var selectedUser = null

var setUsers = function ( usersDetails, budgets ) {
    users       = []
    userBudgets = budgets
    
    $.each( usersDetails, function ( i, userDetail ) {
        var user       = UserM( userDetail )
        var userBudget = userBudgets[ user.username ]
        user.setUserSandboxReport( { spending: userBudget } )
        users.push( user )
    } )
}

var getUsers = function () {
    return users
}

var getFilteredUsers = function () {
    var filteredUsers = UsersFilter.filterUsers( users )
    return filteredUsers
}

var getSelectedUser = function () {
    return selectedUser
}

var setSelectedUser = function ( user ) {
    selectedUser = user
}

module.exports = {
    setUsers          : setUsers
    , getUsers        : getUsers
    , getFilteredUsers: getFilteredUsers
    , getSelectedUser : getSelectedUser
    , setSelectedUser : setSelectedUser
}