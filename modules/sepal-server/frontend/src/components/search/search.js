/**
 * @author Mino Togna
 */
require( './search.css' )
require( 'devbridge-autocomplete' )

var EventBus   = require( '../event/event-bus' )
var Events     = require( '../event/events' )
var Animation  = require( '../animation/animation' )
var Loader     = require( '../loader/loader' )
var DatePicker = require( '../date-picker/date-picker' )

var countries = require( './countries.js' )

var SceneAreasRequest = require( './scenea-areas-request' )

var template = require( './search.html' )
var html     = $( template( {} ) )

var section        = null//$( '.app' ).find( '#search' )
var searchSection  = null
var resultsSection = null
var loaded         = false

var show = function ( e, type ) {

    if ( type == 'search' ) {
        var appSection = $( '#app-section' ).find( '.bg-search-l' )
        if ( appSection.children().length <= 0 ) {
            appSection.append( html )

            section        = appSection.find( '#search' )
            searchSection  = section.find( '.search-section' )
            resultsSection = section.find( '.results-section' )

            showSearchSection()

            loaded = true
            initForm()
        }
    }

}

var showSearchSection  = function () {
    searchSection.velocity( 'slideDown', { delay: 100, duration: 500 } )
    resultsSection.velocity( 'slideUp', { delay: 100, duration: 500 } )
}

var showResultsSection = function () {
    searchSection.velocity( 'slideUp', { delay: 100, duration: 500 } )
    resultsSection.velocity( 'slideDown', { delay: 100, duration: 500 } )
}

var initForm = function () {
    var form = section.find( 'form' )

    var country = form.find( '#search-form-country' )
    country.autocomplete( {
        lookup: countries
        , minChars: 0
        , onSelect: function ( selection ) {
            if ( selection ) {
                var cCode = selection.data
                var cName = selection.value

                SceneAreasRequest.countryCode = cCode

                EventBus.dispatch( Events.MAP.ZOOM_TO, null, cName )
            }
        }
        , tabDisabled: true
    } )

    var fromDate      = DatePicker.newInstance( form.find( '.from' ) )
    fromDate.onChange = $.proxy( SceneAreasRequest.fromChange, SceneAreasRequest )

    var toDate      = DatePicker.newInstance( form.find( '.to' ) )
    toDate.onChange = $.proxy( SceneAreasRequest.toChange, SceneAreasRequest )
    toDate.hide()

    var targetDay      = DatePicker.newInstance( form.find( '.target-day' ), true )
    targetDay.onChange = $.proxy( SceneAreasRequest.targetDayChange, SceneAreasRequest )
    targetDay.hide()

    form.find( '.from-label' ).click( function () {
        toDate.hide()
        targetDay.hide()
        fromDate.show()
    } )
    form.find( '.to-label' ).click( function () {
        fromDate.hide()
        targetDay.hide()
        toDate.show()
    } )
    form.find( '.target-day-label' ).click( function () {
        fromDate.hide()
        toDate.hide()
        targetDay.show()
    } )

    form.submit( function ( e ) {
        e.preventDefault()
        SceneAreasRequest.requestSceneAreas()
    } )

}

// var getSceneArea = function ( e, sceneAreaId ) {
//     console.log( sceneAreaId )

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
            console.log( sceneArea )
        } )
        carouselCaption.append( addBtn )
    } )
    carousel.carousel()
    // carousel.on( 'slide.bs.carousel', function ( evt ) {
    //     // console.log( evt.direction)
    //     // console.log( evt.relatedTarget)
    //
    //     var carouselItem = $( evt.relatedTarget )
    //     var sceneArea    = carouselItem.data( 'scene-area' )
    //     console.log( carouselItem )
    //     console.log( sceneArea )
    // } )

}

EventBus.addEventListener( Events.SECTION.SHOW, show )
EventBus.addEventListener( Events.SECTION.SEARCH.SHOW_SCENE_AREA, null, showSceneArea )