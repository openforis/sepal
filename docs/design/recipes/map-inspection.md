# Map inspection and capability-driven layer actions

Exploratory discussion. Scope, interaction design and scheduling are undecided. This is not an implementation
plan or a prerequisite for the current recipe migrations.

## Scenarios

- A Masking output that preserves CCDC segments offers a segment chart at a selected location.
- An optical mosaic recipe has a CCDC asset or recipe added to one map area. That added layer offers its own
  segment chart, independently of the recipe that owns the map.
- Clicking a location opens a general inspector showing raster band values and feature attributes across the
  map area's layers, with results grouped by layer.

## Proposed direction

Map tools consume the resolved outputs and capabilities of layers. The owning recipe type does not determine
every operation available in the map. A specialized action identifies the layer and product it operates on.

For a Masking layer, a chart reads the masked output while its segment interpretation comes from the capability
provider. Following the provider must not bypass the selected layer's mask or other transformations. A Stack may
expose several independently preserved capability instances; containing CCDC-derived bands alone does not prove
that an instance remains usable.

General inspection and specialized charts answer different questions. An inspector can report band values or
feature attributes across layers. A segment chart requires segment structure and date interpretation; showing
original observations alongside fitted segments requires additional evidence that a segments asset may not supply.
Available chart content should reflect what the selected output actually provides.

These scenarios can help evaluate source and capability contracts without committing to a universal toolbar or
tool-registration framework.

## Open questions

- Does a specialized action belong to a selected layer, its layer menu, or the map area's toolbar? How does the
  user choose between multiple eligible layers or multiple capability instances within one layer?
- Does general inspection include all layers or only visible ones? Which features count as being at the clicked
  location, and how are multiple matches presented?
- Which product and parameters does inspection query when a layer displays a named map product rather than the
  recipe's canonical output?
- How are scalar values, arrays, units and encoded values presented? How are masked pixels, no matching feature,
  unavailable evidence and failed reads distinguished?
- What happens to an open inspector or chart when its layer, source, capability or selected location changes?
  Which results can be reused, and which must be cancelled or refreshed?

## Related design

[Output products](output-products.md) owns product descriptions and capabilities;
[source resolution](source-resolution.md) owns provider identity and capability-instance resolution;
[GUI source runtime](gui-source-runtime.md) owns access to source information;
[source freshness](source-freshness.md) owns refresh and cancellation;
[visualizations](visualizations.md) owns layer styles and their validity. General physical-value presentation is
already a deferred topic in the [roadmap](data-sources.md#physical-value-presentation).
