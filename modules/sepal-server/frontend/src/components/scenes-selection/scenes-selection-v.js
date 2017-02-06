/**
 * @author Mino Togna
 */
require( './scenes-selection.scss' )

var SearchParams          = require( '../search/search-params' )
var SectionScenes         = require( './views/section-scenes' )
var SectionSelectedScenes = require( './views/section-selected-scenes' )
var SectionFilterScenes   = require( './views/section-filter-scenes-v' )

var html               = null
var section            = null
var currentSceneAreaId = null

var init = function () {
    
    var appSection = $( '#app-section' ).find( '.scene-images-selection' )
    if ( appSection.children().length <= 0 ) {
        var template = require( './scenes-selection.html' )
        html         = $( template( {} ) )
        
        appSection.append( html )
        
        section = appSection.find( '#scene-images-selection' )
        
        var selectionScenesContainer = section.find( '.selection-section' )
        SectionScenes.init( selectionScenesContainer )
        SectionFilterScenes.init( selectionScenesContainer )
        SectionSelectedScenes.init( section.find( '.selected-section' ) )
    }
    
}

var reset = function ( sceneAreaId, availableSensors ) {
    availableSensors = availableSensors ? availableSensors : []
    
    SectionScenes.reset( sceneAreaId )
    
    // scene area id is changed, therefore selected section reset as well
    if ( !(sceneAreaId && currentSceneAreaId === sceneAreaId) ) {
        SectionSelectedScenes.reset( sceneAreaId )
        
        SectionFilterScenes.setSortWeight( SearchParams.sortWeight )
        SectionFilterScenes.setOffsetToTargetDay( SearchParams.offsetToTargetDay )
        SectionFilterScenes.setSensors( availableSensors, SearchParams.sensors )
        SectionFilterScenes.showButtons()
        
    }
    
    currentSceneAreaId = sceneAreaId
}

// Functions for selection section
var add = function ( sceneImage, filterHidden, selected ) {
    
    SectionScenes.add( sceneImage, filterHidden, selected )
    if ( selected ) {
        SectionSelectedScenes.add( sceneImage )
    }
}

var select   = function ( sceneAreaId, sceneImage ) {
    if ( sceneAreaId === currentSceneAreaId ) {
        
        SectionScenes.hideScene( sceneImage )
        SectionSelectedScenes.add( sceneImage )
    }
}
var deselect = function ( sceneAreaId, sceneImage ) {
    if ( sceneAreaId === currentSceneAreaId ) {
        SectionSelectedScenes.remove( sceneImage )
        SectionScenes.showScene( sceneImage )
    }
}

module.exports = {
    init                  : init
    , reset               : reset
    , add                 : add
    , select              : select
    , deselect            : deselect
    , hideScenesBySensor  : SectionScenes.hideScenesBySensor
    , showScenesBySensor  : SectionScenes.showScenesBySensor
    , setSortWeight       : SectionFilterScenes.setSortWeight
    , setOffsetToTargetDay: SectionFilterScenes.setOffsetToTargetDay
    , setSensors          : SectionFilterScenes.setSensors
}