/**
 * Application Events class
 *
 * @author Mino Togna
 */

var Events = {
  
  AJAX: {
    REQUEST : 'ajax.request'
    , GET   : 'ajax.get'
    , POST  : 'ajax.post'
    , DELETE: 'ajax.delete'
  }
  
  , APP: {
    LOAD            : 'app.load'
    , DESTROY       : 'app.destroy'
    , USER_LOGGED_IN: 'app.user_logged_in'
  }
  
  , LOGIN: {
    HIDE  : 'login.hide'
    , SHOW: 'login.show'
  }
  
  , SECTION: {
    CLOSE_ALL: 'section.close_all'
    , SHOW   : 'section.show'
    , SHOWN  : 'section.shown'
    , REDUCE : 'section.reduce'
    
    , NAV_MENU: {
      LOADED    : 'section.nav_menu.loaded'
      , COLLAPSE: 'section.nav_menu_collapse'
    }
    
    , SEARCH: {
      MOSAIC_LOAD                   : 'section.search.mosaic_load'
      , MOSAIC_DELETE               : 'section.search.mosaic_delete'
      , MOSAIC_CLONE                : 'section.search.mosaic_clone'
      // SHOW_SCENE_AREA: 'section.search.show_scene_area'
      //TODO: move to mosaic_view
      , REQUEST_SCENE_AREAS         : 'section.search.request_scene_areas'
      , SCENE_AREAS_LOADED          : 'section.search.scene_areas_loaded'
      , LANDSAT_SCENE_AREAS_LOADED  : 'section.search.landsat_scene_areas_loaded'
      , SENTINEL2_SCENE_AREAS_LOADED: 'section.search.sentinel2_scene_areas_loaded'
      
      , REQUEST_CLASSIFICATION  : 'section.search.request_classification'
      , REQUEST_CHANGE_DETECTION: 'section.search.request_change_detection'
      
      , STATE: {
        ACTIVE_CHANGE                 : 'section.search.model.active_change'
        , ACTIVE_CHANGED              : 'section.search.model.active_changed'
        , ACTIVE_SEARCH_PARAMS_CHANGED: 'section.search.model.active_search_params_changed'
        , ACTIVE_SAVE                 : 'section.search.model.active_save'
        , ACTIVE_ZOOM_TO              : 'section.search.model.active_zoom_to'
        , RESTORE_DRAWN_AOI           : 'section.search.model.restore_drawn_aoi'
        
        , LIST_LOAD   : 'section.search.model.list_load'
        , LIST_CHANGE : 'section.search.model.list_change'
        , LIST_CHANGED: 'section.search.model.list_changed'
      }
      
      , VIEW: {
        SHOW_LIST             : 'section.search.list_view.show_list'
        , ADD_MOSAIC          : 'section.search.list_view.show_mosaic'
        , ADD_CLASSIFICATION  : 'section.search.list_view.show_classification'
        , ADD_CHANGE_DETECTION: 'section.search.list_view.show_change_detection'
      }
      
    }
    
    , SEARCH_RETRIEVE: {
      BEST_SCENES               : 'section.search_retrieve.best_scenes'
      , RETRIEVE_SCENES         : 'section.search_retrieve.retrieve_scenes'
      , PREVIEW_MOSAIC          : 'section.search_retrieve.preview_mosaic'
      , RETRIEVE_MOSAIC         : 'section.search_retrieve.retrieve_mosaic'
      , MOSAIC_LOADED           : 'section.search_retrieve.mosaic_loaded'
      , TOGGLE_MOSAIC_VISIBILITY: 'section.search_retrieve.toggle_mosaic_visibility'
      , COLLAPSE_VIEW           : 'section.search_retrieve.collapse_view'
      , SHOW_SCENE_AREAS        : 'section.search_retrieve.show_scene_areas'
      , HIDE_SCENE_AREAS        : 'section.search_retrieve.hide_scene_areas'
    }
    
    , BROWSE: {
      NAV_ITEM_CLICK : 'section.browse.nav_item_click'
      , DOWNLOAD_ITEM: 'section.browse.download_item'
      , DELETE_ITEM  : 'section.browse.delete_item'
    }
    
    , PROCESS: {}
    
    , TERMINAL: {}
    
    , SCENES_SELECTION: {
      RESET          : 'section.scenes_selection.reset'
      , SELECT       : 'section.scenes_selection.select'
      , DESELECT     : 'section.scenes_selection.deselect'
      , RELOAD_SCENES: 'section.scenes_selection.reload_scenes'
      , PREVIEW_SCENE: 'section.scenes_selection.preview_scene'
    }
    
    , TASK_MANAGER: {
      REMOVE_TASK   : 'section.task_manager.remove_task'
      , CANCEL_TASK : 'section.task_manager.cancel_task'
      , EXECUTE_TASK: 'section.task_manager.execute_task'
      , CHECK_STATUS: 'section.task_manager.check_status'
      , UPDATED     : 'section.task_manager.updated'
    }
    
    , USER : {
      REMOVE_SESSION     : 'section.user.remove_session'
      , SAVE_USER_DETAILS: 'section.user.save_user_details'
      , CHANGE_PASSWORD  : 'section.user.change_password'
    }
    , USERS: {
      SELECT_USER                : 'section.users.select_user'
      , SHOW_USERS_LIST          : 'section.users.show_users_list'
      , SHOW_INVITE_USER         : 'section.users.show_invite_user'
      , SHOW_EDIT_USER           : 'section.users.show_edit_user'
      , SHOW_DELETE_USER         : 'section.users.show_delete_user'
      , SHOW_SEND_INVITATION_USER: 'section.users.show_send_invitation_user'
      , FILTER                   : {
        ACTIVE_CHANGED                : 'section.users.filter.changed'
        , SEARCH_STRING_CHANGE        : 'section.users.filter.search_string_change'
        , USERS_ACTIVE_CHANGE         : 'section.users.filter.users_active_change'
        , USERS_PENDING_CHANGE        : 'section.users.filter.users_pending_change'
        , USERS_LOCKED_CHANGE         : 'section.users.filter.users_locked_change'
        , USERS_BUDGET_EXCEEDED_CHANGE: 'section.users.filter.users_budget_exceeded_change'
      }
      , SORT                     : {
        RESET   : 'section.users.sort.reset'
        , ACTIVE: 'section.users.sort.active'
      }
    }
  }
  
  , MAP: {
    ZOOM_TO                 : 'map.zoom_to'
    , ZOOM_CHANGED          : 'map.zoom_changed'
    // , LOAD_SCENE_AREAS: 'map.load_scene_areas'
    , SCENE_AREA_CLICK      : 'map.scene_area_click'
    , ADD_LAYER             : 'map.add_layer'
    , REMOVE_AOI_LAYER      : 'map.remove_aoi_layer'
    // , ADD_EE_LAYER                        : 'map.add_ee_layer'
    // , REMOVE_EE_LAYER                     : 'map.remove_ee_layer'
    // , EE_LAYER_TOGGLE_VISIBILITY          : 'map.ee_layer_toggle_visibility'
    // , EE_LANDSAT_LAYER_TOGGLE_VISIBILITY  : 'map.ee_landsat_layer_toggle_visibility'
    // , EE_SENTINEL2_LAYER_TOGGLE_VISIBILITY: 'map.ee_sentinel2_layer_toggle_visibility'
    , ADD_DRAWN_AOI_LAYER   : 'map.add_drawn_aoi_layer'
    , REMOVE_DRAWN_AOI_LAYER: 'map.remove_drawn_aoi_layer'
    , ADD_EE_MOSAIC         : 'map.add_ee_mosaic'
    , REMOVE_EE_MOSAIC      : 'map.remove_ee_mosaic'
    , POLYGON_DRAW          : 'map.polygon_draw'
    , POLYGON_DRAWN         : 'map.polygon_drawn'
    , POLYGON_CLEAR         : 'map.polygon_clear'
  }
  
  , SCENE_AREAS: {
    INIT           : 'scene_areas.init'
    , RESET        : 'scene_areas.reset'
    , SCENES_UPDATE: 'scene_areas.scenes_update'
  }
  
  // , SCENE_AREA_MOSAICS: {
  //     LANDSAT    : {
  //         ADD                : "scene_area_mosaics.landsat.add"
  //         , TOGGLE_VISIBILITY: "scene_area_mosaics.landsat.toggle_visibility"
  //     }
  //     , SENTINEL2: {
  //         ADD                : "scene_area_mosaics.sentinel2.add"
  //         , TOGGLE_VISIBILITY: "scene_area_mosaics.sentinel2.toggle_visibility"
  //     }
  // }
  
  , USER: {
    USER_DETAILS_LOADED         : 'user.user_details_loaded'
    , USER_SANDBOX_REPORT_LOADED: 'user.user_sandbox_report_loaded'
    , RELOAD_USER_DETAILS       : 'user.reload_user_details'
    , PASSWORD_CHANGED          : 'user.password_changed'
    , LOGGED_OUT                : 'user.logged_out'
  }
  
  , ALERT: {
    SHOW_INFO: 'alert.show_info'
  }
  
  , APP_MANAGER: {
    OPEN_IFRAME   : 'app_manager.open_iframe'
    , OPEN_RSTUDIO: 'app_manager.open_rstudio'
    , OPEN_DATAVIS: 'app_manager.open_datavis'
    , CLOSED      : 'app_manager.closed'
  }
  
  , APPS: {
    DATA_VIS: {
      MAP_INITIALIZED                    : 'apps.data_vis.map_initialized'
      , ADD_MAP_LAYER                    : 'apps.data_vis.add_map_layer'
      , FORCE_UPDATE_LAYER               : 'apps.data_vis.force_update_layer'
      , REMOVE_MAP_LAYER                 : 'apps.data_vis.remove_map_layer'
      , MAP_LAYER_TILES_LOADING          : 'apps.data_vis.map_layer_tiles_loading'
      , MAP_TILES_LOADED                 : 'apps.data_vis.map_tiles_loaded'
      , MAP_LAYER_CHANGE_OPACITY         : 'apps.data_vis.map_layer_change_opacity'
      , MAP_LAYER_ZOOM_TO                : 'apps.data_vis.map_layer_zoom_to'
      , LAYER_DELETE                     : 'apps.data_vis.layer_delete'
      , ADD_FILE                         : 'apps.data_vis.add_file'
      , LAYERS_LOADED                    : 'apps.data_vis.layers_loaded'
      , UPDATE_LAYER_OPTION_BTNS_POSITION: 'apps.data_vis.update_layer_option_btns_position'
      , GET_FEATURE_INFO                 : 'apps.data_vis.get_feature_info'
    }
  }
  
}

module.exports = Events