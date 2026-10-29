# Recipe data sources: architecture

Current shared recipe architecture and its technical design index. All backlog items, delivery slices
and research questions are maintained in the [SEPAL workplan](../workplan.md).

## Design documents

| Document | Responsibility |
| --- | --- |
| [Behavior contracts](behavior-contracts.md) | Ownership, operation validity, editing, feedback, repair and asynchronous lifetime. |
| [Output products](output-products.md) | Canonical/named products, physical bands, export requirements, encoding and target source composition. |
| [Source resolution](source-resolution.md) | Dependency graph, authorization, readiness, provider identity and target execution bundles/provenance. |
| [GUI source runtime](gui-source-runtime.md) | Pure reads, shared acquisition, candidates, watches and recipe-scoped interaction. |
| [Source freshness](source-freshness.md) | Live currency, revisions, assets and target persisted-result evidence. |
| [Visualizations](visualizations.md) | Presets, local styles, draft Copy/Paste, applicability and target transformation templates. |
| [Mask and Fill](mask.md) | Current Apply mask contract and proposed Fill modes. |

Individual recipe behavior and local limitations belong in [recipe developer notes](../../recipes/README.md).
User documentation belongs in the separate `sepal-doc` repository. Keep a rule at its owner and link to it rather
than restating it in each consumer.

## Current architecture

All image-producing types declare `IMAGE_OUTPUT`; Sampling Design declares `NO_IMAGE_OUTPUT`. Shared registration
rejects an undeclared image/no-image contract. Canonical output, named map products, physical schema, GUI decoration
and capability requirements are distinct. Map and Retrieve consume one common read rather than per-type band
availability helpers. [Output declarations](output-products.md#declaration-and-description) describe this contract.

The source runtime owns asynchronous work and evidence. Shared pure requirements produce located findings;
type/GUI declarations apply them to operations and repair fields. Description availability, structural dependency
validity, readiness and evidence currency remain separate. Source facts do not overwrite editable choices.

References retain selected outer execution identity while capability providers supply interpretation. Browser
preflight uses authenticated closure loading. Server operations retain one authorized record per recipe ID and
preserve each subscriber's context. Neither path supplies a graph-wide coherent execution bundle today.

Recipe-owned modal panels inherit scope centrally. Recipe selectors and known recipe names in shared validation
feedback use the same open-or-focus action, preserving existing drafts. The interaction contracts are in
[the GUI runtime](gui-source-runtime.md#recipe-scoped-panels-and-navigation).

### Band encoding

Encoding is a per-band fact (`physical = stored * scale + offset`), separate from pixel size and measurement
compatibility. The [output contract](output-products.md#band-encoding) owns its persisted asset format, bounds,
reader and export-authority rules.
