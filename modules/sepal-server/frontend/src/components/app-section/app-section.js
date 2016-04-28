/**
 * @author Mino Togna
 */

require( './app-section.css' )

require( '../search/search' )

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
        reduce()
    } else {
        show()
    }
} )
var lastOpenEvent = null

var show = function ( e ) {
    if ( !section.hasClass( 'opened' ) ) {

        section
            .velocity( { left: '10%' }
                , {
                    duration: 1000
                    , easing: 'swing'
                    , queue: false
                    , delay: 300
                    , complete: function () {
                        showSection( e.type )
                    }
                }
            )

        section.removeClass( 'closed' ).removeClass( 'reduced' ).addClass( 'opened' )

        var icon = closeBtn.find( 'i' )
        icon.fadeOut( 600, function () {
            var newIcon = $( '<i class="fa fa-times-circle" aria-hidden="true"></i>' ).hide()
            closeBtn.empty().append( newIcon )
            newIcon.fadeIn( 700 )
        } )

    } else {

        showSection( e.type )

    }
}

var showSection = function ( eventType ) {
    if ( eventType !== lastOpenEvent ) {

        var idx = -1
        switch ( eventType ) {
            case Events.SECTION.SEARCH.SHOW:
                idx = 0
                break

            case Events.SECTION.BROWSE.SHOW:
                idx = 1
                break

            case Events.SECTION.PROCESS.SHOW:
                idx = 2
                break

            case Events.SECTION.TERMINAL.SHOW:
                idx = 3
                break
        }

        carousel.carousel( idx )
    }
}

var hide = function () {
    if ( !section.hasClass( 'closed' ) ) {

        section
            .velocity( { left: '120%' }
                , {
                    duration: 1000
                    , easing: 'swing'
                    , queue: false
                    , delay: 500
                }
            )
        section.addClass( 'closed' ).removeClass( 'opened' ).removeClass( 'reduced' )
    }
}

var reduce = function () {
    if ( section.hasClass( 'opened' ) ) {

        section
            .velocity( { left: '95%' }
                , {
                    duration: 1000
                    , easing: 'swing'
                    , queue: false
                    , delay: 500
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

EventBus.addEventListener( Events.SECTION.SEARCH.SHOW, show )
EventBus.addEventListener( Events.SECTION.BROWSE.SHOW, show )
EventBus.addEventListener( Events.SECTION.PROCESS.SHOW, show )
EventBus.addEventListener( Events.SECTION.TERMINAL.SHOW, show )

EventBus.addEventListener( Events.SECTION.CLOSE_ALL, hide )
EventBus.addEventListener( Events.SECTION.REDUCE, reduce )