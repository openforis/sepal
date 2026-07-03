# Earth Engine Feature Asset Overlays

Last updated: 2026-07-02

This document captures the planned design for visualizing Earth Engine feature collection assets as generic map overlays. The immediate driver is Sampling Design: live procedural sample preview is not reliable enough, but users still need to inspect exported sample points on the map.

## Goals

- Support generic Earth Engine `FeatureCollection`/table assets as map overlays.
- Keep layer state separate from recipe model state, following the existing `recipe.layers` pattern.
- Keep the Layers panel compact on small screens.
- Make feature overlays available in every map area without making them draggable image-layer sources.
- Allow per-map-area visibility, ordering, opacity, and styling for feature overlays.
- Automatically add and show Sampling Design GEE table exports as feature overlays.

## Non-Goals

- Do not support client-side files such as CSV, GeoJSON, or Shapefile in the first slice.
- Do not require Sampling Design recipes to have image output.
- Do not attempt to render procedural Sampling Design samples directly as live map preview.
- Do not implement feature hover or click inspection in the first styling slice.

## Background

Sampling Design sample preview exposed a hard Earth Engine limitation. A procedural `FeatureCollection` can return a `mapId` quickly, but each tile request can still recompute the upstream graph and time out. The export path already needs a two-phase materialization step for systematic sampling, so exact interactive sample visualization should be based on materialized table assets, not live procedural preview.

The recipe can therefore have no image output and no live sample preview. Users inspect results by rendering the exported GEE table asset as a generic feature overlay.

## State Model

Layer state remains under `recipe.layers`, not `recipe.model`.

Current image sources use `layers.additionalImageLayerSources`. Add a parallel root for user-added feature sources:

```js
layers: {
  additionalImageLayerSources: [
    // existing image source shape
  ],
  additionalFeatureLayerSources: [
    {
      id: 'ee-table:<stable-id>',
      type: 'EETableAsset',
      defaultEnabled: false,
      sourceConfig: {
        asset: 'projects/.../assets/south_sudan_samples',
        label: 'South Sudan samples',
        description: 'projects/.../assets/south_sudan_samples',
        defaultStyle: {
          colorMode: 'ONE_COLOR',
          color: '#00ffff',
          pointSize: 4,
          width: 1,
          fillOpacity: 0.25,
          opacity: 1
        }
      }
    }
  ],
  areas: {
    center: {
      imageLayer: {sourceId: 'google-satellite'},
      featureLayers: [
        {
          sourceId: 'aoi',
          disabled: false,
          layerConfig: {opacity: 1}
        },
        {
          sourceId: 'ee-table:<stable-id>',
          disabled: true,
          layerConfig: {
            style: {
              colorMode: 'ONE_COLOR',
              color: '#00ffff',
              pointSize: 4,
              width: 1,
              fillOpacity: 0.25,
              opacity: 1
            }
          }
        }
      ]
    }
  }
}
```

Source lists describe what overlays are available. `layers.areas[area].featureLayers` describes the order, visibility, and per-area configuration for a map area.

`withLayers()` should merge:

```js
[
  ...recipeFeatureLayerSources,
  ...additionalFeatureLayerSources,
  ...areaFeatureLayerSources,
  ...imageLayerDerivedFeatureSources
]
```

`MapAreaLayout.updateFeatureLayers()` should preserve existing feature layer order/config and append missing sources with their default enabled state/config. It must not reorder existing configured overlays just because the source list order changes.

## Layers Panel

The existing Layers panel should remain a single compact list.

- Image sources appear first.
- Feature sources appear last.
- Image rows keep the drag handle and can be dropped into map areas as image layers.
- Feature rows are not draggable.
- Feature rows have only a delete/remove action.
- Feature rows should be visually distinguishable by the missing drag handle and, optionally, a small overlay/table icon.
- Avoid section headers initially to preserve vertical space.

Feature row display:

- Title: `sourceConfig.label`.
- Description/tooltip: full asset ID.
- Remove action: removes the source and cleans it from every area’s `featureLayers`.

## Add Earth Engine Asset Flow

The "Add an Earth Engine asset" flow is type-aware.

1. User enters or selects an EE asset ID.
2. GUI resolves metadata.
3. GUI routes by asset type:
   - image/image collection -> `additionalImageLayerSources`
   - feature collection/table -> `additionalFeatureLayerSources`
4. User can enter an optional short label.
5. Default label should come from:
   - asset metadata title/name if available,
   - otherwise the basename of the asset ID.
6. Full asset ID remains visible as description/tooltip.

The optional label is useful for both image and feature assets. Full asset IDs are too long for map controls.

## Styling Model

Keep feature styling deliberately small. The first useful model is geometry-agnostic and works for points, lines, polygons, and mixed `FeatureCollection`s without requiring a separate metadata probe for geometry type.

Global style controls:

- `color`: the default stroke/point color.
- `width`: line width and outline width for polygons and point shapes.
- `fillOpacity`: fill opacity for polygons and point shapes. It may be a no-op for line-only tables.
- `pointSize`: point marker size in pixels. It may be a no-op for line/polygon-only tables.
- `pointShape`: defer as a UI option; use EE's default `circle` for now.
- `opacity`: whole-layer tile opacity. This is a renderer-level setting and is separate from `fillOpacity`.

Do not try to hide controls based on geometry in the first slice. EE table assets do not reliably expose enough geometry metadata cheaply, and mixed geometries are possible. Showing the same compact control set everywhere is simpler and more predictable.

### Color Modes

Color should be the only property-dependent styling dimension initially. Other styling options (`width`, `fillOpacity`, `pointSize`) apply to all features in the layer.

Supported color modes (UI labels in parentheses):

- `ONE_COLOR` ("One color"): use one global color for every feature.
- `COLORS_FROM_PROPERTY` ("From property"): read color values directly from a feature property. If the table has a property named `color`, default to this mode with `colorProperty: 'color'`. Sampling Design exports already include a `color` property, so exported samples should style correctly without duplicating the palette in layer state.
- `COLORS_BY_VALUE` ("By value"): choose a property and map distinct values to colors. This should behave like existing legend color editing/import, including import options where practical. Only features whose value is in the list are drawn (no global "other" color); by-value styling controls color only.

Suggested shape:

```js
style: {
  colorMode: 'ONE_COLOR' | 'COLORS_FROM_PROPERTY' | 'COLORS_BY_VALUE',
  color: '#00ffff',
  colorProperty: 'color',
  valueProperty: 'stratum',
  valueColors: {
    '1': '#e41a1c',
    '2': '#377eb8'
  },
  width: 1,
  fillOpacity: 0.25,
  pointSize: 4,
  opacity: 1
}
```

If a `COLORS_FROM_PROPERTY` value is missing or null, fall back to the global `color`.

When rendering polygons or point shapes, the fill color uses the selected feature color with `fillOpacity` applied. For `COLORS_FROM_PROPERTY`, the per-feature color is applied server-side: hex color values get `fillOpacity` alpha, and non-hex color strings pass through unchanged.

Earth Engine's `FeatureCollection.style()` supports collection-wide and feature-specific style dictionaries with `color`, `pointSize`, `pointShape`, `width`, `fillColor`, `styleProperty`, `neighborhood`, and `lineType`. `fillColor` fills polygons and point shapes; when feature-specific styles use larger `pointSize` or `width`, `neighborhood` must cover the maximum `pointSize + width` to avoid tiling artifacts.

Defer:

- numeric ramps,
- size by property,
- width by property,
- opacity by property,
- point shape selection,
- labels/text rendering,
- rule-based expressions,
- multi-symbol layer stacks.

## Map Area Overlay Selector

The current map-area popup feature buttons should evolve into a compact overlay selector, conceptually similar to a combo but for ordered multi-selection.

Collapsed state:

```text
AOI, South Sudan samples, Labels
```

Rules:

- Show enabled overlays only.
- Preserve the order from `layers.areas[area].featureLayers`.
- Use short labels.
- Truncate when needed, for example `AOI, Samples +2`.

Expanded popover:

```text
☑ AOI
☑ South Sudan samples      ⚙   opacity
☐ Validation points        ⚙   opacity
☑ Labels                   ⚙   opacity
```

Rows should support:

- enable/disable,
- drag sorting,
- opacity control,
- optional options button for configurable overlays.

The options button opens a modal/panel for visualization settings. For `EETableAsset`, use the styling model above.

The same mechanism can later configure built-ins. For example, Google Map labels can eventually expose options for which label categories to show.

## Rendering

Add a generic `EETableAsset` feature source type.

Rendering should use the existing EE table map machinery:

- `EarthEngineTableLayer`
- `api.gee.eeTableMap$`
- the existing `/api/gee/table/map` backend route

The feature layer renderer should pass:

```js
{
  tableId: source.sourceConfig.asset,
  style: layerConfig.style || source.sourceConfig.defaultStyle
}
```

Layer order is the order of `layers.areas[area].featureLayers`. The renderer already receives a `layerIndex`; it should continue to use that ordering.

Whole-layer tile opacity should be treated as a renderer capability on `EarthEngineTableLayer` / `GoogleMapsOverlay`. It is separate from `fillOpacity`, which affects polygon fill styling.

## Feature Interaction

The current EE table rendering path produces raster tiles. Once EE has painted features into tiles, the browser does not know feature identities or geometries, so true hover effects, per-feature highlighting, and client-side hit testing are not available.

Do not build hover interaction for EE table overlays.

Click inspection can be considered later as a separate server-query feature: on map click, send the coordinate, active table asset, and a tolerance to the backend, query nearby/intersecting features in EE, and return a small set of properties for a popup or panel. This is useful, but out of scope for the overlay/styling work.

## Sampling Design Integration

Sampling Design should not expose a live "Samples" preview layer.

Keep `skipThis: true` and `defaultGoogleSatellite: true`; Sampling Design has no normal "This Recipe" image layer. Keep export/retrieve as the authoritative way to produce exact sample points.

### Auto-Adding Exported Assets

When a Sampling Design GEE table export succeeds, the GUI should automatically add the exported table asset as an `EETableAsset` feature source and enable it in the relevant map areas.

The added overlay represents an exported snapshot, not the current live recipe state. It must not be called "This Recipe" or otherwise imply that it updates when the recipe settings change.

Rules:

- If the exported asset ID is already present as a feature source:
  - keep the current show/hide state,
  - keep existing per-area style/config,
  - update label/metadata only if needed.
- If the exported asset ID is new:
  - add it to `layers.additionalFeatureLayerSources`,
  - hide previously displayed Sampling Design exported sample sources,
  - enable the new source in the map area(s),
  - preserve old sources in the Layers panel; do not remove them.
- If there are multiple exports to the same asset ID:
  - do not reset visibility,
  - do not reset style,
  - treat it as the same overlay source.
- If the export destination is SEPAL/local files rather than a GEE asset:
  - do not add an EE feature overlay in this first slice.

The exact trigger should be a successful task completion if the GUI has a completion hook. If only submit-time data is available, the source may be added as disabled/pending on submit, then enabled after task success. Avoid enabling an asset before it exists, since the table map layer would fail until EE can resolve it.

### Identifying Sampling Design Export Sources

Sampling Design-exported feature sources should carry metadata so they can be managed as a family:

```js
sourceConfig: {
  asset,
  label,
  description,
  generatedBy: {
    recipeType: 'SAMPLING_DESIGN',
    recipeId,
    taskId
  }
}
```

This lets the GUI hide previous Sampling Design exports for the same recipe when a new asset ID is exported, without affecting unrelated user-added table assets.

### Exported Asset Properties

Sampling Design GEE table exports already include recipe provenance through the existing task/export property flow. The feature-overlay design should preserve that behavior and treat those properties as provenance for the exported snapshot, not as a live link to the current recipe settings.

## Remaining Roadmap

1. Replace the current feature-layer button group with the compact ordered overlay selector when styling/order editing needs a proper UI. It should show enabled overlays in order when collapsed, support enable/disable, drag sorting, opacity, and an options button.
2. Automatically add Sampling Design GEE table exports as `EETableAsset` overlays after successful task completion, when there is a clean task-to-recipe metadata/update mechanism. The first fallback remains manually adding the exported EE table asset through the generic "Add Earth Engine asset" flow.
3. Consider click inspection later as a server-query feature. Do not build hover interaction while EE table overlays render as raster tiles.

## Design Decisions

- Sampling Design exported assets should be enabled in all map areas when they are added.
- The exported asset label should use the recipe title as a human-friendly snapshot name. The full asset ID remains available as description/tooltip. If the recipe title is missing, fall back to the asset basename. Do not label exported assets "This Recipe".
- Recipes that do not produce image output should not have a "This Recipe" image layer source.
- Do not add a task details "Add to map" action unless automatic add-on-success proves impractical. The preferred behavior is automatic when a clean task-to-recipe update path exists; until then, users can manually add exported EE table assets.
- Keep feature styling simple: property-dependent styling is color-only, either from a color property or a value-to-color mapping. Width, fill opacity, and point size apply globally to the layer.
- Fill opacity applies in every color mode, including `COLORS_FROM_PROPERTY`: the control is shown for all modes, and the GEE path applies the configured alpha to hex color-property values (non-hex color strings pass through unchanged).
- Do not infer geometry type in the first styling slice; show the same compact controls for all EE table overlays and accept geometry-specific no-ops.
- Do not support hover effects for EE table overlays while rendering through raster EE tiles. Click inspection is a separate future feature.
- If automatic add-on-success requires task completion code to update recipe layer state, defer it until there is a clean generic task-to-recipe metadata/update mechanism.
