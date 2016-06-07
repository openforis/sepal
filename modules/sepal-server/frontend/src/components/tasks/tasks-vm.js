/**
 * @author Mino Togna
 */
var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Loader    = require( '../loader/loader' )
var Animation = require( '../animation/animation' )
var NavMenu   = require( '../nav-menu/nav-menu' )
var Model     = require( './tasks-m' )
var View      = require( './tasks-v' )

var jobTimer      = null
var navMenuButton = null
var initialized   = false

var init = function ( e ) {
    if ( !initialized ) {
        View.init()
        
        navMenuButton = NavMenu.btnTasks()
        
        setTimeout( function () {
            jobTimer = setInterval( requestTasks, 1000 )
        }, 1000 )
        
        initialized = true
    }
}

var requestTasks = function () {
    var params = {
        url      : '/api/tasks'
        , success: function ( tasks ) {
            Model.setTasks( tasks )
            // console.log( Model.getTasks() )
            
            if ( Model.isEmpty() ) {
                Animation.animateOut( navMenuButton )
                navMenuButton.find( 'i' ).removeClass( 'fa-spin' )
            } else {
                Animation.animateIn( navMenuButton )
                
                if ( Model.isActive() ) {
                    navMenuButton.find( 'i' ).addClass( 'fa-spin' )
                } else {
                    navMenuButton.find( 'i' ).removeClass( 'fa-spin' )
                }

                View.addTasks( Model.getTasks() )
            }
        }
    }
    
    EventBus.dispatch( Events.AJAX.REQUEST, null, params )
}

EventBus.addEventListener( Events.SECTION.SHOW, init )