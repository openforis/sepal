/**
 * @author Mino Togna
 */
require( './search.css' )
require( 'devbridge-autocomplete' )

var EventBus         = require( '../event/event-bus' )
var Events           = require( '../event/events' )
// var Animation        = require( '../animation/animation' )
// var Loader           = require( '../loader/loader' )
var SceneAreasSearch = require( './scene-areas-search' )

// html
var template = require( './search.html' )
var html     = $( template( {} ) )

// html inner sections
var section        = null//$( '.app' ).find( '#search' )
var searchSection  = null
var resultsSection = null

var show = function ( e, type ) {

    if ( type == 'search' ) {
        var appSection = $( '#app-section' ).find( '.bg-search-l' )
        if ( appSection.children().length <= 0 ) {
            appSection.append( html )

            section        = appSection.find( '#search' )
            searchSection  = section.find( '.search-section' )
            resultsSection = section.find( '.results-section' )

            SceneAreasSearch.setForm( section.find( 'form' ) )

            showSearchSection()
        }
    }

}

var showSearchSection = function () {
    searchSection.velocity( 'slideDown', { delay: 100, duration: 500 } )
    resultsSection.velocity( 'slideUp', { delay: 100, duration: 500 } )
}

var showResultsSection = function () {
    searchSection.velocity( 'slideUp', { delay: 100, duration: 500 } )
    resultsSection.velocity( 'slideDown', { delay: 100, duration: 500 } )
}

var showSceneArea = function ( sceneAreas ) {
    console.log( sceneAreas )

    EventBus.dispatch( Events.SECTION.SHOW, null, 'search' )

    showResultsSection()

    var details   = resultsSection.find( '.details' )
    var selection = resultsSection.find( '.selection' )
    var summary   = resultsSection.find( '.summary' )

    var carousel      = selection.find( '.carousel' )
    var carouselInner = carousel.find( '.carousel-inner' )
    $.each( sceneAreas, function ( i, sceneArea ) {
        var carouselItem = $( '<div class="carousel-item" />' )
        // carouselItem.data( 'scene-area', sceneArea )
        carouselInner.append( carouselItem )
        if ( i == 0 ) {
            carouselItem.addClass( 'active' )
        }

        var img = $( ' <img width="100%"/>' )
        img.attr( 'src', sceneArea.browseUrl )
        carouselItem.append( img )

        var carouselCaption = $( '<div class="carousel-caption">' )
        carouselItem.append( carouselCaption )

        var addBtn = $( '<button type="button" class="btn btn-base circle icon">/' )
        addBtn.append( '<i class="fa fa-plus-circle" aria-hidden="true"></i>' )
        addBtn.append( ' Add' )
        addBtn.click( function ( e ) {
            e.preventDefault()
            // console.log( sceneArea )
        } )
        carouselCaption.append( addBtn )
    } )
    carousel.carousel()

}

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SEARCH.SHOW_SCENE_AREA, null, showSceneArea )