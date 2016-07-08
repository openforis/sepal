/**
 * @author Mino Togna
 */
require( './scenes-selection.css' )

var moment = require( 'moment' )

var FilterView = require( '../scenes-selection-filter/scenes-selection-filter-v' )

var EventBus  = require( '../event/event-bus' )
var Events    = require( '../event/events' )
var Animation = require( '../animation/animation' )
var Sensors   = require( '../sensors/sensors' )

var template = require( './scenes-selection.html' )
var html     = $( template( {} ) )

var section                       = null
// section for selecting images
var selectionSection              = null
var imagesSelectionSection        = null
var imageSelectionSection         = null
var expandedImageSelectionSection = null
// section of selected images
var selectedSection               = null
var selectedSectionHeader         = null
var selectedSectionTableHeader    = null
var selectedSectionTableContent   = null
var selectedSectionTableRow       = null

var currentSceneAreaId = null

var init = function () {
    
    var appSection = $( '#app-section' ).find( '.scene-images-selection' )
    if ( appSection.children().length <= 0 ) {
        // var appSection = $( '#app-section' ).find( '.scene-images-selection' )
        appSection.append( html )
        
        section                       = appSection.find( '#scene-images-selection' )
        selectionSection              = section.find( '.selection-section' )
        imagesSelectionSection        = selectionSection.find( '.images-section' )
        imageSelectionSection         = appSection.find( '.image-section' )
        expandedImageSelectionSection = appSection.find( '.expanded-image-section' )
        //
        selectedSection               = section.find( '.selected-section' )
        selectedSectionHeader         = selectedSection.find( '.section-header' )
        selectedSectionTableHeader    = selectedSection.find( '.table-header' )
        selectedSectionTableContent   = selectedSection.find( '.table-content' )
        selectedSectionTableRow       = selectedSection.find( '.table-row' )
        
        FilterView.init( selectionSection )
    }
    
}

var reset = function ( sceneAreaId ) {
    imagesSelectionSection.empty()
    // scene area id is changed, therefore selected section rest as well
    if ( currentSceneAreaId !== sceneAreaId ) {
        
        selectedSectionTableContent.empty()
        selectedSectionTableHeader.hide()
        
        currentSceneAreaId = sceneAreaId
    }
    
    imagesSelectionSection.velocity( 'scroll', { duration: 0 } )
}

// Functions for selection section
var add = function ( sceneImage, filterHidden, selected ) {
    var imgSection = getImageSectionForSelection( sceneImage )
    
    imagesSelectionSection.append( imgSection )
    if ( filterHidden ) {
        imgSection.addClass( 'filter-hidden' )
        imgSection.hide( 0 )
    } else if ( selected ) {
        imgSection.addClass( 'selected' )
        imgSection.hide( 0 )
        addToSelectedSection( sceneImage )
    } else {
        imgSection.show( 0 )
    }
}

var hideFromSelection = function ( sceneImage ) {
    // console.log( sceneImage )
    var imgSection = imagesSelectionSection.find( '.' + sceneImage.sceneId )
    imgSection.addClass( 'selected' )
    
    Animation.animateOut( imgSection )
    
    setTimeout( function ( e ) {
        // Animation.removeAnimation( imgSection )
        // imgSection.hide()
    }, 600 )
}

var showInSelection = function ( sceneImage ) {
    var imgSection = imagesSelectionSection.find( '.' + sceneImage.sceneId )
    imgSection.removeClass( 'selected' )
    
    if ( !imgSection.hasClass( 'filter-hidden' ) ) {
        imgSection.velocity( 'scroll', {
            container : imagesSelectionSection
            , duration: 600
            , delay   : 100
        } )
        
        Animation.animateIn( imgSection )
    }
}

var getImageSectionForSelection = function ( sceneImage ) {
    var imgSection = imageSelectionSection.clone()
    imgSection.addClass( sceneImage.sceneId )
    imgSection.addClass( 'sensor-' + sceneImage.sensor )
    
    var img = imgSection.find( 'img' )
    img.attr( 'src', sceneImage.browseUrl )
    
    var imgHover = imgSection.find( '.img-hover' )
    img.mouseenter( function () {
        imgHover.fadeIn( 150 )
        img.velocity( { opacity: 0.5 }, { duration: 150 } )
    } )
    imgHover.mouseleave( function () {
        imgHover.fadeOut( 150 )
        img.velocity( { opacity: 1 }, { duration: 150 } )
    } )
    
    imgHover.click( function () {
        expandedImageSelectionSection.find( 'img' ).attr( 'src', sceneImage.browseUrl ).click( function () {
            Animation.animateOut( expandedImageSelectionSection )
        } )
        expandedImageSelectionSection.find( '.scene-id' ).empty().append( sceneImage.sceneId )
        expandedImageSelectionSection.find( '.cloud-cover' ).empty().append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
        expandedImageSelectionSection.find( '.sensor' ).empty().append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + Sensors[ sceneImage.sensor ].name )
        expandedImageSelectionSection.find( '.acquisition-date' ).empty().append( '<i class="fa fa-calendar" aria-hidden="true"></i> ' + sceneImage.acquisitionDate )
        expandedImageSelectionSection.find( '.target-day' ).empty().append( '<i class="fa fa-calendar-times-o" aria-hidden="true"></i> ' + sceneImage.daysFromTargetDay )
        expandedImageSelectionSection.find( '.sun-azimuth' ).empty()
            .append( '<span class="fa-stack"><i class="fa fa-sun-o fa-stack-2x" aria-hidden="true"></i><i class="fa fa-ellipsis-h fa-stack-1x" aria-hidden="true"></i></span> ' + sceneImage.sunAzimuth.toFixed( 2 ) )
        expandedImageSelectionSection.find( '.sun-elevation' ).empty()
            .append( '<span class="fa-stack"><i class="fa fa-sun-o fa-stack-2x" aria-hidden="true"></i><i class="fa fa-ellipsis-v fa-stack-1x" aria-hidden="true"></i></span> ' + sceneImage.sunElevation.toFixed( 2 ) )
        
        // acquisitionDate: '2015-03-20', cloudCover: 0.08, sunAzimuth: 150.48942477, sunElevation: 42.80026465 , daysFromTargetDay : 5
        // expandedImageSelectionSection.velocity( "stop" ).velocity( 'fadeIn', {
        //     delay   : 20,
        //     duration: 500
        // } )
        Animation.animateIn( expandedImageSelectionSection )
    } )
    
    //TODO : add daysFromTargetDay
    imgSection.find( '.cloud-cover' ).append( '<i class="fa fa-cloud" aria-hidden="true"></i> ' + sceneImage.cloudCover )
    imgSection.find( '.sensor' ).append( '<i class="fa fa-rocket" aria-hidden="true"></i> ' + Sensors[ sceneImage.sensor ].shortName )
    imgSection.find( '.acquisition-date' ).append( '<i class="fa fa-calendar" aria-hidden="true"></i> ' + moment( sceneImage.acquisitionDate, "YYYY-MM-DD" ).format( "YYYY" ) )
    imgSection.find( '.target-day' ).append( '<i class="fa fa-calendar-times-o" aria-hidden="true"></i> ' + sceneImage.daysFromTargetDay )
    
    imgSection.find( '.btn-add' ).click( function () {
        EventBus.dispatch( Events.SECTION.SCENES_SELECTION.SELECT, null, sceneImage )
    } )
    
    return imgSection
}

// selected section methods
var addToSelectedSection = function ( sceneImage ) {
    // if not already added
    if ( selectedSectionTableContent.find( '.' + sceneImage.sceneId ).length <= 0 ) {
        
        var imgSection = selectedSectionTableRow.clone()
        imgSection.addClass( sceneImage.sceneId )
        
        var img = imgSection.find( 'img' )
        img.attr( 'src', sceneImage.browseUrl )
        
        imgSection.find( '.cloud-cover' ).append( sceneImage.cloudCover )
        imgSection.find( '.sensor' ).append( Sensors[ sceneImage.sensor ].shortName )
        imgSection.find( '.btn-remove' ).click( function ( e ) {
            e.preventDefault()
            EventBus.dispatch( Events.SECTION.SCENES_SELECTION.DESELECT, null, sceneImage )
        } )
        
        selectedSectionTableContent.append( imgSection )
        
        Animation.animateIn( imgSection )
        
        imgSection.velocity( 'scroll', {
            container : selectedSectionTableContent
            , duration: 600
            , delay   : 100
        } )
        
        updateSelectedSectionHeader()
    }
}

var removeFromSelectedSection = function ( sceneImage ) {
    var imgSection = selectedSectionTableContent.find( '.' + sceneImage.sceneId )
    
    setTimeout( function () {
        imgSection.hide()
    }, 600 )
    
    Animation.animateOut( imgSection, function () {
        imgSection.remove()
        updateSelectedSectionHeader()
    } )
    
}

var updateSelectedSectionHeader = function () {
    if ( selectedSectionTableContent.children().length > 0 ) {
        selectedSectionTableHeader.show()
    } else {
        selectedSectionTableHeader.hide()
    }
}

var select   = function ( sceneImage ) {
    hideFromSelection( sceneImage )
    addToSelectedSection( sceneImage )
}
var deselect = function ( sceneImage ) {
    removeFromSelectedSection( sceneImage )
    showInSelection( sceneImage )
}

// filter methods
var hideScenesBySensor = function ( sensor ) {
    var scenes = imagesSelectionSection.find( '.sensor-' + sensor )
    scenes.addClass( 'filter-hidden' )
    
    scenes = scenes.not( '.selected' )
    scenes.fadeOut( 300 )
    // $.each( scenes, function ( i, scene ) {
    //     scene = $( scene )
    //
    //     setTimeout( function () {
    //         scene.hide( 0 )
    //     }, i * 25 )
    // } )
}

var showScenesBySensor = function ( sensor ) {
    var scenes = imagesSelectionSection.find( '.sensor-' + sensor )
    scenes.removeClass( 'filter-hidden' )
    
    scenes = scenes.not( '.selected' )
    $.each( scenes, function ( i, scene ) {
        scene = $( scene )
        setTimeout( function () {
            scene.show( 0 )
        }, i * 50 )
    } )
}

module.exports = {
    init                : init
    , reset             : reset
    , add               : add
    , select            : select
    , deselect          : deselect
    , hideScenesBySensor: hideScenesBySensor
    , showScenesBySensor: showScenesBySensor
}