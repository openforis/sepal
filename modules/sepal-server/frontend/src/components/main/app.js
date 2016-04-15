require( 'bootstrap' )
require( '../ajax/ajax' )
require( '../login/login' )

var EventBus	= require( '../event/event-bus' );

// global app variables
var User = null

// event handlers
EventBus.addEventListener( 'user.logged' , function(e , user){
    User = user
})

// exposed global app variables
module.exports = {
    User : User
}