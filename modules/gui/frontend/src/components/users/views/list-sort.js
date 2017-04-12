/**
 * @author Mino Togna
 */

var EventBus = require( '../../event/event-bus' )
var Events   = require( '../../event/events' )

var html        = null
var tableHeader = null

var hoverElement  = null
var sortProperty  = null
var sortDirection = null

var init = function ( container ) {
    tableHeader = container
    
    html = tableHeader.find( '.data-sorting-popup' )
    
    html.find( '.btn-sort-desc' ).click( function () {
        sort( 'desc' )
    } )
    
    html.find( '.btn-sort-asc' ).click( function () {
        sort( 'asc' )
    } )
    
    html.mouseleave( hide )
    
    tableHeader.find( '.data-sorting' ).mouseenter( function ( e ) {
        hoverElement = $( this )
        show()
    } )
}

var show = function () {
    hoverElement.append( html )
    
    html.find( 'button' ).removeClass( 'active' )
    var property = hoverElement.data( 'sorting-property' )
    if ( sortProperty == property ) {
        var btnSort = html.find( 'button.btn-sort-' + sortDirection )
        btnSort.addClass( 'active' )
    }
    
    html.stop().fadeIn()
}

var hide = function () {
    html.stop().fadeOut()
}

var clearActiveSortElement = function () {
    var element = tableHeader.find( '.sort-active' )
    if ( element ) {
        element.removeClass( 'sort-active' )
        element.find( 'i.sort-reset' ).remove()
    }
}

var resetSort = function () {
    EventBus.dispatch( Events.SECTION.USERS.SORT.RESET )
    
    sortProperty  = null
    sortDirection = null
}

var sort = function ( direction ) {
    hide()
    clearActiveSortElement()
    
    var property = hoverElement.data( 'sorting-property' )
    
    if ( property == sortProperty && sortDirection == direction ) {
        resetSort()
    } else {
        sortProperty  = property
        sortDirection = direction
        
        EventBus.dispatch( Events.SECTION.USERS.SORT.ACTIVE, null, sortProperty, sortDirection )
        
        var i = html.find( 'button.btn-sort-' + direction + ' i' ).clone()
        i.addClass( 'sort-reset' )
        
        hoverElement.addClass( 'sort-active' )
        hoverElement.append( i )
    }
}


module.exports = {
    init: init
    
}