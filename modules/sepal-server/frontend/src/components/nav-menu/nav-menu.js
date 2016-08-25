/**
 * @author Mino Togna
 */
require( './nav-menu.css' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )

var template = require( './nav-menu.html' )
var html     = $( template( {} ) )

var btnSearch   = html.find( 'a.bg-search' )
var btnBrowse   = html.find( 'a.bg-browse' )
var btnProcess  = html.find( 'a.bg-process' )
var btnTerminal = html.find( 'a.bg-terminal' )
var btnUser     = html.find( 'a.user' )
var btnUsers    = html.find( 'a.users' )
var btnTasks    = html.find( 'a.tasks' )

var show = function () {
    EventBus.dispatch( Events.APP.REGISTER_ELEMENT, null, html.attr( 'id' ) )
    
    $( '.app' ).append( html )
    $( '#nav-menu' ).removeClass( 'collapsed' )
    
    var showSection = function ( e ) {
        var btn = $( this )
        collapseMenu( btn )
        EventBus.dispatch( Events.SECTION.SHOW, null, btn.data( 'section-target' ) )
    }
    
    html.find( 'a' ).click( showSection )
    
    // init style
    btnTasks.hide( 0 )
    btnUser.hide( 0 )
    btnUsers.hide( 0 )
    
    btnSearch.addClass( 'expanded' ).empty().append( '<i class="fa fa-globe" aria-hidden="true"></i> Search' )
    btnBrowse.addClass( 'expanded' ).empty().append( '<i class="fa fa-folder-open" aria-hidden="true"></i> Browse' )
    btnProcess.addClass( 'expanded' ).empty().append( '<i class="fa fa-wrench" aria-hidden="true"></i> Process' )
    btnTerminal.addClass( 'expanded' ).empty().append( '<i class="fa fa-terminal" aria-hidden="true"></i> Terminal' )
    
    Animation.animateIn( btnSearch )
    Animation.animateIn( btnBrowse )
    Animation.animateIn( btnProcess )
    Animation.animateIn( btnTerminal )
}


var collapseMenu = function ( button ) {
    if ( button.hasClass( 'expanded' ) ) {
        
        // Animation.removeAnimation( btnSearch )
        // Animation.removeAnimation( btnBrowse )
        // Animation.removeAnimation( btnProcess )
        // Animation.removeAnimation( btnTerminal )
        
        Animation.animateOut( button )
        
        var delay = 100
        $.each( button.siblings().not( '.tasks' ).not( '.user' ).not( '.users' ), function ( i, btnSibling ) {
            
            delay += 150
            btnSibling = $( btnSibling )
            
            setTimeout( function () {
                Animation.animateOut( btnSibling )
            }, delay )
            
        } )
        
        delay += 900
        setTimeout( function () {
            $( '#nav-menu' ).addClass( 'collapsed' )
            
            btnSearch.empty().removeClass( 'expanded' ).append( '<i class="fa fa-globe" aria-hidden="true"></i>' )
            btnBrowse.empty().removeClass( 'expanded' ).append( '<i class="fa fa-folder-open" aria-hidden="true"></i>' )
            btnProcess.empty().removeClass( 'expanded' ).append( '<i class="fa fa-wrench" aria-hidden="true"></i>' )
            btnTerminal.empty().removeClass( 'expanded' ).append( '<i class="fa fa-terminal" aria-hidden="true"></i>' )
            
            setTimeout( function () {
                Animation.animateIn( btnSearch )
                Animation.animateIn( btnBrowse )
                Animation.animateIn( btnProcess )
                Animation.animateIn( btnTerminal )
                
                btnUser.css( 'display', 'block' )
                Animation.animateIn( btnUser, function () {
                    EventBus.dispatch( Events.SECTION.NAV_MENU.LOADED )
                } )
                
            }, 250 )
            
            
            // $( '#sepal-logo' ).velocity( { 'left': '42%' }, {
            // $( '#sepal-logo' ).velocity( { 'top': '0%', 'left': '0%', 'opacity': '0.7' }, {
            //     duration: 1500,
            //     easing  : 'swing',
            //     delay   : 1500,
            //     queue   : false
            // } )
            
            // $.each( $( "#sepal-logo" ).find( 'div' ), function ( i, e ) {
            //     var elem = $( this )
            //     elem.velocity( "fadeIn", { display: "inline-block", delay: i * 1000, easing: 'swing' } )
            // } )
            
        }, delay )
        
    }
}

EventBus.addEventListener( Events.APP.LOAD, show )

module.exports = {
    btnTasks  : function () {
        return btnTasks
    }
    , btnUsers: function () {
        return btnUsers
    }
}
