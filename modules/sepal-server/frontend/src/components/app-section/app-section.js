/**
 * @author Mino Togna
 */

require( './app-section.css' )

require( '../search/search-mv' )
require( '../terminal/terminal-mv' )
require( '../browse/browse-mv' )
require( '../user/user-mv' )
require( '../process/process-mv' )

var EventBus = require( '../event/event-bus' )
var Events   = require( '../event/events' )

var Animation = require( '../animation/animation' )

var template = require( './app-section.html' )
var html     = $( template( {} ) )

var loadHtml = function () {
    $( '.app' ).append( html )
}
loadHtml()

var section = $( '.app' ).find( '#app-section' ).css( 'left', '120%' ).addClass( 'closed' )

var carousel = section.find( '#app-section-carousel' )
carousel.carousel( { interval: 0 } )

var closeBtn = section.find( '.btn-close' )
closeBtn.click( function ( e ) {
    e.preventDefault()
    
    if ( section.hasClass( 'opened' ) ) {
        EventBus.dispatch( Events.SECTION.REDUCE )
    } else {
        EventBus.dispatch( Events.SECTION.SHOW )
    }
    
} )

var show = function ( e, type ) {
    if ( !section.hasClass( 'opened' ) ) {
        
        section
            .velocity( { left: '10%' }
                , {
                    duration  : 1000
                    , easing  : 'swing'
                    , queue   : false
                    , delay   : 300
                    , complete: function () {
                        showSection( type )
                    }
                }
            )
        
        section.removeClass( 'closed' ).removeClass( 'reduced' ).addClass( 'opened' )
        
        var icon = closeBtn.find( 'i' )
        icon.fadeOut( 600, function () {
            var newIcon = $( '<i class="fa fa-chevron-circle-right" aria-hidden="true"></i>' ).hide()
            // var newIcon = $( '<i class="fa fa-times-circle" aria-hidden="true"></i>' ).hide()
            closeBtn.empty().append( newIcon )
            newIcon.fadeIn( 700 )
        } )
        
    } else {
        
        showSection( type )
        
    }
}

var showSection = function ( type ) {
    var carouselItem = carousel.find( '.carousel-item.' + type )
    if ( !carouselItem.hasClass( 'active' ) ) {
        carousel.carousel( carouselItem.index() )
    }
}

// TODO: CHECK IF NEEDED
// var hide = function () {
//     if ( !section.hasClass( 'closed' ) ) {
//
//         section
//             .velocity( { left: '120%' }
//                 , {
//                     duration: 1000
//                     , easing: 'swing'
//                     , queue: false
//                     , delay: 500
//                 }
//             )
//         section.addClass( 'closed' ).removeClass( 'opened' ).removeClass( 'reduced' )
//     }
// }

var reduce = function () {
    if ( section.hasClass( 'opened' ) ) {
        
        section
            .velocity( { left: '95%' }
                , {
                    duration: 1000
                    , easing: 'swing'
                    , queue : false
                    , delay : 100
                }
            )
        
        section.addClass( 'reduced' ).removeClass( 'opened' ).removeClass( 'closed' )
        
        var icon = closeBtn.find( 'i' )
        icon.fadeOut( 600, function () {
            var newIcon = $( '<i class="fa fa-chevron-circle-left" aria-hidden="true"></i>' ).hide()
            closeBtn.empty().append( newIcon )
            newIcon.fadeIn( 700 )
        } )
    }
}

EventBus.addEventListener( Events.SECTION.SHOW, show )
// EventBus.addEventListener( Events.SECTION.CLOSE_ALL, hide )
EventBus.addEventListener( Events.SECTION.REDUCE, reduce )