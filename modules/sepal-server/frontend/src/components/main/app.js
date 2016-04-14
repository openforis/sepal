require( 'bootstrap' )
require( '../ajax/ajax' )
require( '../login/login' )

var EventBus	= require( '../event-bus/event-bus' );

// global app variables
var User = {}

// event handlers
EventBus.addEventListener( 'user.logged' , function(e , user){
    User = user

    console.log( user )
})

// exposed global app variables
module.exports = {
    User : User
}