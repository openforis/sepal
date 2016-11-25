/**
 * @author Mino Togna
 */
require( './nav-menu.css' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )

var html        = null
// ui components
var NavMenu     = null
var btnSearch   = null
var btnBrowse   = null
var btnProcess  = null
var btnTerminal = null

var show = function () {
    var template = require( './nav-menu.html' )
    html         = $( template( {} ) )
    $( '.app' ).append( html )
    
    btnSearch   = html.find( '.btn.bg-search' )
    btnBrowse   = html.find( '.btn.bg-browse' )
    btnProcess  = html.find( '.btn.bg-process' )
    btnTerminal = html.find( '.btn.bg-terminal' )
    
    NavMenu = $( '#nav-menu' )
    NavMenu.removeClass( 'collapsed' )
    
    var showSection = function ( e ) {
        var btn = $( this )
        
        EventBus.dispatch( Events.SECTION.NAV_MENU.COLLAPSE, null, btn )
        EventBus.dispatch( Events.SECTION.SHOW, null, btn.data( 'section-target' ) )
    }
    
    html.find( 'a' ).click( showSection )
    
    // init style
    btnSearch.addClass( 'expanded' ).empty().append( '<i class="fa fa-globe" aria-hidden="true"></i> Search' )
    btnBrowse.addClass( 'expanded' ).empty().append( '<i class="fa fa-folder-open" aria-hidden="true"></i> Browse' )
    btnProcess.addClass( 'expanded' ).empty().append( '<i class="fa fa-wrench" aria-hidden="true"></i> Process' )
    btnTerminal.addClass( 'expanded' ).empty().append( '<i class="fa fa-terminal" aria-hidden="true"></i> Terminal' )
    
    Animation.animateIn( btnSearch )
    Animation.animateIn( btnBrowse )
    Animation.animateIn( btnProcess )
    Animation.animateIn( btnTerminal )
}

var collapsing = false
var collapse   = function ( e, button ) {
    
    if ( !(NavMenu.hasClass( 'collapsed' ) || collapsing ) ) {
        collapsing = true
        
        button = ( button ) ? button : btnSearch
        Animation.animateOut( button )
        
        var delay = 100
        $.each( button.siblings(), function ( i, btnSibling ) {
            
            delay += 150
            btnSibling = $( btnSibling )
            
            setTimeout( function () {
                Animation.animateOut( btnSibling )
            }, delay )
            
        } )
        
        delay += 900
        setTimeout( function () {
            NavMenu.addClass( 'collapsed' )
            
            btnSearch.empty().removeClass( 'expanded' ).append( '<i class="fa fa-globe" aria-hidden="true"></i>' )
            btnBrowse.empty().removeClass( 'expanded' ).append( '<i class="fa fa-folder-open" aria-hidden="true"></i>' )
            btnProcess.empty().removeClass( 'expanded' ).append( '<i class="fa fa-wrench" aria-hidden="true"></i>' )
            btnTerminal.empty().removeClass( 'expanded' ).append( '<i class="fa fa-terminal" aria-hidden="true"></i>' )
            
            setTimeout( function () {
                
                Animation.animateIn( btnSearch )
                Animation.animateIn( btnBrowse )
                Animation.animateIn( btnProcess )
                Animation.animateIn( btnTerminal , function () {
                    EventBus.dispatch( Events.SECTION.NAV_MENU.LOADED )
                    collapsing = false
                } )
    
            }, 250 )
            
        }, delay )
        
    }
}

EventBus.addEventListener( Events.APP.LOAD, show )
EventBus.addEventListener( Events.SECTION.NAV_MENU.COLLAPSE, collapse )

module.exports = {
    btnTasks  : function () {
        return btnTasks
    }
    , btnUsers: function () {
        return btnUsers
    }
}
