# An imagery workspace in SEPAL: GeoLibre and RustGIS

SEPAL users retrieve imagery into their home folder and need somewhere to view, style and process it and keep their
work. This document evaluates two browser-based GIS applications for that role,
[GeoLibre](https://github.com/opengeos/GeoLibre) and [RustGIS](https://github.com/opengeos/RustGIS). Each would run in
the user's sandbox, integrated with SEPAL's files and processing.

**Status:** nothing is implemented, and neither application has run on SEPAL.

**Evidence markers:**
- **established:** read in SEPAL's code or the pinned upstream sources, or run in local containers built from SEPAL's
  images (only the overview chain in [preparing imagery](#preparing-imagery));
- **proposed:** a design decision of this document;
- **experiment:** only a run on a dev SEPAL can settle it.

**Pinned versions** (October 2026):
- GeoLibre 3.4.0 (tag and PyPI wheel);
- RustGIS `v0.3.0` (`498fd5e9e`) and `main` (`e5046e00e64f`, 21 October 2026);
- Voilà 0.5.11, jupyter-server-proxy 4.4.0 and 4.6.0, jupyter_server 2.21.1, tornado 6.5.

**Out of scope:**
- JupyterGIS, which loads GeoTIFFs into the browser whole;
- desktop builds and remote desktops;
- pysepal: our own controls follow the look of the application they sit in.

## Evaluation brief

**What we are deciding:** whether either application provides a useful **SEPAL imagery workspace**. We are not
committing to exposing every feature of either. Features that do not work well on SEPAL data are hidden. An
application that cannot give a coherent experience for the workflows below is not adopted.

**What "integrated" means.** Without knowing about Jupyter, proxies, tokens or the browser/sandbox divide, a user can:
1. open an image retrieved in SEPAL, from their SEPAL home, as one image;
2. view and style it smoothly: navigation, band selection, stretches, colours;
3. process a polygon they drew or selected, and see the result;
4. save through the application's normal Save and Open into their SEPAL home, with downloading to their own computer
   as a separate, explicit choice;
5. return after closing the app or getting a new sandbox, and find imagery, styling, polygons, edits and results intact.

Passing technical checks does not by itself establish this.

**How the pieces fit.** Everything runs on machines SEPAL already uses.
- **The user's sandbox** serves, through its Jupyter server:
  - the application;
  - home files (`/api/sandbox/jupyter/files/<path>`) and their listing and saving (`…/api/contents/<path>`);
  - a [job service](#the-sandbox-job-service) for processing, in the app's kernel.
- **A browser integration layer** connects each application's existing interface to these:
  - **GeoLibre:** a deployment policy, a start-up script with a file-picker adapter, and a bundled plugin, added to its
    published web build;
  - **RustGIS:** browser integration code, a Rust crate compiled with RustGIS's interface into its WebAssembly
    application.
- **SEPAL** gains only [generic features](#generic-sepal-work).

**Processing: what runs where.** Neither design runs every existing tool in the sandbox. Menus offering tools that
fail or mislead on SEPAL data count against an integration.

| | GeoLibre | RustGIS |
|---|---|---|
| **Work as they are** | Map, raster styling, drawing, editing; browser vector tools on small layers | Map, drawing, editing; built-in vector tools on small layers |
| **SEPAL equivalents** (job service) | Prepare for viewing, materialize mosaic, statistics | The same |
| **Hidden or labelled** | Browser raster and Whitebox tools (load whole files, up to 512 MB); desktop-only dialogs; plugin installation; sharing; exports bypassing the save path | GeoLibre-runner tools and raster commands (in-browser data only; SEPAL imagery cannot be an input); Add Data from file (embeds data in the project) |

**Before viewing imagery.** A SEPAL retrieval is a folder of tiles with a `.vrt` over them
([what SEPAL exports](#what-sepal-exports)):
- **GeoLibre** reads the `.vrt` directly when its tiles have overviews; without them it draws only zoomed in until
  prepared.
- **RustGIS** cannot read a `.vrt`, so `.vrt`-based retrievals are first prepared into one COG. A COG with a layout
  it handles well ([large data](#large-data-and-state)) opens directly.

Preparation writes into the user's home and counts towards their quota. The evaluation judges whether it is
understandable: why it is needed, progress and time estimate, storage shown beforehand, the quota warning, and what
happens to the file later. A [viewer-friendly export](#a-viewer-friendly-sepal-export) would make it unnecessary for
new retrievals only if its layout proves to suit both applications in the performance tests.

### How the two are evaluated

**The same inputs and conditions for both:**
- **exports:** a multi-gigabyte, multi-band SEPAL export (for example 20,000 × 20,000 pixels, 10 bands, with a scaled
  optical band), a classification and a Float32 export;
- **polygons:** a drawn one, a layer crossing tile boundaries, and a layer in another coordinate system;
- **environment:** the same browser, machine and sandbox instance type;
- **workflows:** the five steps above, plus preparing an image and materializing a mosaic.

**Measured against pass/fail limits agreed before testing:**
- browser memory, bytes transferred, time to first image and frame times while panning and zooming;
- preparation and mosaic time, and peak temporary disk;
- statistics against an independent computation, and job memory.

**Rough-edge log**, each entry rated blocking, significant or minor:
- repeated or confusing dialogs;
- unexpected downloads;
- styling reachable only through command search;
- confusing failures or unexplained waits;
- lost state;
- misleading menus.

**Acceptable compromises:**
- SEPAL's tools in a submenu or ribbon tab of their own;
- an explained preparation step with progress and storage shown;
- some tools hidden;
- labelled "from this computer" actions beside SEPAL's;
- needing a sandbox;
- band numbers instead of names in the prototype.

**Reasons to stop:**
- silent loss of work (a save reported done but not written, edits lost on reopening);
- downloads the user did not choose;
- imagery unviewable within the limits;
- styling users cannot reach in the interface;
- misleading menus that cannot be hidden;
- quota filled without warning;
- one account's data visible to another;
- adaptation that needs substantial rework at every upgrade.

**Next step:** GeoLibre's [Stage 0](#stage-0) before its full plugin; the RustGIS [prototype](#prototype) kept
bounded, assessing its styling and save-contract gaps explicitly; production decided on measured results.

## Shared design

### Catalog apps in SEPAL

Both are catalog apps: one Git repository each, rendered with Voilà in the user's sandbox so users see the application,
not a notebook (established).

- **Catalog** (`/var/lib/sepal/app-manager/apps.json` or `SEPAL_APPS_CATALOG_URL`, served at `GET /api/apps/list`):
  - **fields:** `id`, `label`, `endpoint: 'jupyter'`, `path`, `repository`, `branch`, `cacheVenv`, `tags` (supply
    `[]`), `pinned`, `hidden`, `disabled`, `googleAccountRequired`, `tagline`, `description`, `translations`, `logo` or
    `logoRef`, `author`, `projectLink`, `requirements`;
  - **path:** `/sandbox/jupyter/voila/render/shared/apps/<repository name>/<notebook>.ipynb`, with no query string,
    which would break the gateway's attribution of the app's requests.
- **Install** (`update-app.sh`):
  - clones into the shared apps folder, read-only in sandboxes at `~/shared/apps/<name>`;
  - builds `venv-<name>` from `requirements.txt` (or micromamba), always pre-installing `ipykernel`, `numpy`,
    `gdal==3.11.4` and SEPAL's `earthengine-api` fork, which an app must not replace;
  - the notebook's kernelspec must name `venv-<name>`.
  - **Front-end extensions** come from the app's environment (so `anywidget` and `ipywidgets` belong there). Jupyter
    server extensions from it never load, since the server runs on the system Python.
- **Running:**
  - the GUI writes the Voilà page into an empty same-origin frame;
  - each render starts a new kernel (working directory read-only, `HOME=/home/sepal-user`), and Voilà never
    reconnects;
  - the GUI keeps all of a user's Jupyter apps on one instance.

**Catalog apps over the alternatives**, on packaging and lifecycle grounds. Either browser integration layer could
connect to the same services under any model, and RustGIS's save contract is needed either way.
- **Packages in the sandbox image:** every upgrade would be a SEPAL release and a new worker AMI, sharing the system
  Python.
- **A first-class sandbox endpoint,** like RStudio: SEPAL would maintain a server, port, launch and routing for each
  application. Catalog apps reuse app-manager's install from Git, its per-app environments, Voilà, and the existing
  app tabs and session handling. That model's advantages, request routing by path and a frame the GUI already
  observes, are matched by the [generic SEPAL work](#generic-sepal-work).

### Files through the sandbox

- **Reading:** layers refer to `/api/sandbox/jupyter/files/<path in home>`, served with the user's SEPAL session.
  - Such URLs survive kernel restarts and sandbox replacement (proposed).
  - A `.vrt`'s tiles resolve as siblings.
  - Range requests through the gateway are an experiment.
- **Listing and saving:** Jupyter's contents API (body-size limit an experiment).
- **Prepared and converted files** live in the home folder (`/files/` serves nothing else, and they must outlive the
  sandbox), so they count towards the quota. The user is warned before exceeding it, and removing them is an explicit
  cleanup.
- **No per-kernel tokens:** GeoLibre's own file route maps one file per token, dies with the kernel and cannot serve a
  `.vrt`'s siblings.

### The sandbox job service

A small HTTP service in the app's kernel, reached through the Jupyter proxy, the same for both applications (proposed).

- **Before starting:** refuses an output that would not fit on disk, warns of quota, and asks before overwriting.
- **While running:** reports progress through GDAL callbacks and can be cancelled. A cancelled or failed job leaves no
  partial output; errors read plainly, with details on request.
- **Lifetime:** long jobs run detached from the kernel, with state under the home folder, so a reopened app finds them.
  A sandbox replacement ends them.
- **Responses are small JSON;** outputs are files in home, added by `/files/` URL. Nothing large passes through
  jupyter-server-proxy, which buffers responses whole up to 100 MB (established).

#### Preparing imagery

**A COG from a `.vrt` or GeoTIFF:**
- `gdal.Translate` with `COMPRESS=DEFLATE|ZSTD`, a predictor suited to the type, `BIGTIFF=IF_SAFER` and
  `NUM_THREADS=ALL_CPUS`;
- band descriptions and nodata kept, and nodata set if the user gives it;
- full-resolution pixels never resampled.

**Per-band overview resampling:** the COG driver applies one `OVERVIEW_RESAMPLING` to all bands. A chain with a
method per band ran in SEPAL's task image (GDAL 3.13.3, established):
1. a `.vrt` per band;
2. `gdaladdo` with mode for categorical and average for continuous bands;
3. `gdalbuildvrt -separate`;
4. `gdal_translate -of COG -co OVERVIEWS=FORCE_USE_EXISTING`.

Class values survived in the categorical band's overviews. Rerunning it on the sandbox's GDAL 3.11.4 is an experiment.

**Which bands are categorical:** for existing exports the user is asked, defaulting to nearest neighbour for integer
bands and average for floating point; a viewer-friendly export records it.

**Block size and band layout** follow the viewer (RustGIS's limits in [large data](#large-data-and-state)).

#### Materializing a mosaic

`gdal.Translate` from the `.vrt` to a tiled GeoTIFF or COG at a chosen location, with progress, cancellation, a
free-space check and overwrite confirmation.

#### Statistics

GDAL, OGR and OSR only.

**Zones are captured at submission:** the whole image, drawn polygons, or a polygon layer's current features (or its
selection). The job keeps those geometries, so later edits do not change it. A layer's original file may be read
instead only when it still represents the zones (no edits, no selection filter, unchanged fingerprint), which is the
route for layers too large to hold in the application.

**Each polygon:**
- transformed to the image's coordinate system (traditional axis order);
- rasterized into a window mask (pixel centres, or "all touched");
- read band by band at full resolution, mask and pixels block by block, from the `.vrt`, so no merge is needed and
  memory stays bounded.

**Stored versus physical values:**
- **Encodings:** SEPAL stores bands with a scale, offset and unit; optical reflectance, for example, at 10,000 per unit
  (`OPTICAL_STORED_PER_UNIT`, `lib/js/shared/src/recipe/optical/encoding.js`).
- **GDAL reads return stored values** regardless of a file's scale and offset metadata. So:
  - **nodata** is compared on stored values, from the image or the user, since SEPAL exports carry none;
  - **continuous bands** are reported as `stored × scale + offset` when the encoding is known (from export metadata or
    a user preset). Minimum, maximum, mean and sum are transformed accordingly, and the standard deviation by
    `|scale|`. Otherwise values are reported as stored, and labelled so;
  - **categorical bands** are never scaled;
  - **every column** states its unit, or "stored value".

**Outputs:**
- **continuous bands:** count, nodata count, min, max, mean, standard deviation, sum;
- **categorical bands:** per-class counts;
- **area:** from pixel area, computed per row for geographic coordinate systems.

The results are a CSV, optionally a GeoPackage of the polygons with their statistics, in home, plus the polygons on the
map within the application's limit for data held in the project.

**Tests against an independent computation:** a band with scale 0.0001 and offset -0.1 with nodata; polygons in
another coordinate system; a polygon edited after its layer was added.

### What SEPAL exports

Established (`imageSepalExport.js:21-25`, `retrievePanel.jsx`):
- **Layout:** a folder in `~/downloads/` of GeoTIFF tiles (default at most 2,560 × 2,560 pixels each), and a `.vrt`
  over them built with `gdalbuildvrt`, with band names set.
- **Data types:** all bands are cast to one type (`castToLargest`).
- **Not set:** no nodata value. Band encodings and pyramiding policies are known to the gee module but dropped for this
  destination.
- **Tiles:** small samples are tiled 256 × 256, LZW, in COG layout.
- **Experiments:** masked-pixel values, and whether large tiles carry overviews.

### Generic SEPAL work

Each item is useful beyond these applications (proposed).

#### Single Jupyter host and kernel shutdown

**How routing works today** (established):
- The gateway routes `/api/sandbox/jupyter/…` (`resolveTarget`, `sandboxSessionManager.js`) by, in order: a kernel id
  in the path, the longest matching app path, `Referer`, then the user's only Jupyter host. Nothing follows that
  fallback.
- `Referer` never helps: SEPAL sends `no-referrer`, and WebSocket upgrades carry none.
- **With two Jupyter hosts, these resolve to nothing:** proxied services (the job service included), the file and
  contents routes, Voilà's assets, and its kernel-shutdown beacon. This was shown with stubbed worker responses, not a
  GUI workflow.
- **One host per user is a client convention.** The worker enforces uniqueness per app path, not per endpoint group.
- **A race with one host:** closing an app can drop the gateway's only candidate before the shutdown beacon arrives,
  orphaning the kernel. No culling is configured, and failed renders are retried up to 9 times, each starting a kernel.

**Proposed:**
- enforce or repair the single-host invariant server-side, tested with concurrent opens, moves and reconnects;
- fix the shutdown race;
- consider culling idle disconnected kernels separately, as it affects JupyterLab.

**Session-scoped routing** remains the fuller fix if the invariant proves too restrictive: a `SEPAL_SESSION_ID` in
the sandbox, `/api/sandbox/jupyter/session/<id>/…` authorized against the user's sessions and stripped, and re-scoped
`Location` headers.

#### Session activity in nested frames

**The problem:**
- Only real interaction extends a session: input in an app's frame, or terminal activity.
- The GUI watches `pointerdown`, `keydown`, `wheel` and `touchstart` on the app frame's document only. Both
  applications draw in a nested same-origin frame, whose input goes unseen, and proxied requests do not count.
- So a user working only in the map looks idle, unless busy processing extends the session (capped at
  `MAX_UNATTENDED_HOURS`). Under `SESSION_EXPIRY_MODE=notify` they are warned; under `enforce` closed.

**Fix:** observe same-origin frames nested at any depth, including ones added or navigated later; skip cross-origin
frames without marking the app unobservable.

**Tests:** a nested and a late-added frame report input; a cross-origin frame neither reports nor changes
observability; nothing is reported after close. A live check first confirms the existing listeners survive the Voilà
page being written into the frame.

#### Browser storage bound to one account

**Why:**
- Apps served through the sandbox share SEPAL's origin, and so its `localStorage`, IndexedDB and Cache Storage.
- GeoLibre keeps project history, recent projects, start-up snapshots (`geolibre.startupProjectSnapshots`), settings
  and libraries there.
- Accounts change without logout too: a login can replace another account's session (`ensureSessionFor`,
  `session.js:119-129`), or follow an expired one.

**Proposed:**
- **Clearing:** the GUI records which account last used the storage. When another account starts, after logout,
  replacement or expiry, it clears the origin's storage before anything else runs, keeping only SEPAL's device
  preferences. Logout also sends `Clear-Site-Data: "storage"`.
- **Completion gate:**
  - a missing marker counts as unknown storage, and is cleared;
  - no embedded app starts until clearing has completed;
  - other open tabs stop their embedded apps when they see the account change, before clearing.
- **Tests:** logout, replacement and expiry, with an app open in a second tab, and with no marker beforehand.

#### A viewer-friendly SEPAL export

A retrieve option, **Cloud-optimized with overviews**, possibly the default for the SEPAL destination.

**Facts** (established):
- Earth Engine's own COG option builds 5 overview levels only for files of 512 pixels or more, cubic for floating
  point and nearest otherwise. After `castToLargest`, a class band beside a float band would get cubic overviews.
- The task image has GDAL 3.13.3.
- The gee module knows each band's pyramiding policy and encoding, but passes only band names to the task.

**Proposed:**
1. **gee returns** `bands: [{name, pyramidingPolicy, encoding}]` with the export response (additive).
2. **The task post-processes** after download: the per-band chain into one COG (mode for `mode`, average for `mean`,
   nearest for `sample`); nodata, scale, offset and unit set, and recorded as band metadata; tiles kept or replaced as
   chosen.
3. **Nodata** is set at export (`formatOptions.noData`) or by a mask; the value per data type is still to be designed.
4. **A task operation** `image.prepare` on a path in home applies the same chain to existing exports.
5. **One layout for both viewers,** settled by the performance tests:
   - **Constraints:** block size, band interleave and band count. RustGIS `v0.3.0` decodes every band of a
     pixel-interleaved COG for each tile and refuses band-separate ones; `main` reads only the shown bands of a
     band-separate COG. GeoLibre's behaviour with each layout is untested.
   - **Candidate:** 256-pixel blocks, band-separate, which only RustGIS `main` and later could read.
   - **Until the tests pass:** whether the GDAL 3.13.3 COG driver writes band-separate files, and how GeoLibre reads
     them, are experiments. Until both viewers pass with one layout, exported COGs may still need preparation for one
     of them.

**Costs:**
- each conversion takes 1 CPU and 4 GB, in one of the main host's 4 local-processing slots, and must keep reporting
  progress;
- disk use roughly doubles unless the tiles are removed;
- tasks do not check quota today.

### Platform facts

- **jupyter-server-proxy** is unpinned (`>=4.2.0`; 4.6.0 current):
  - it reaches any local port;
  - ranges, 206, conditional requests, 304 and WebSockets pass through;
  - responses are buffered whole, capped at 100 MB, with a 300 s timeout.
- **Frames:**
  - the Voilà page inherits the GUI's CSP `connect-src`, so it cannot fetch other hosts;
  - the application's frame gets the proxy's headers (`frame-ancestors` only, `nosniff`, `no-referrer`,
    `Cache-Control: no-cache`), so servers must answer revalidation with 304.
- **Storage:**
  - home is the file browser's storage (EFS on AWS) and survives sandbox replacement; `/tmp` is per-instance local disk;
  - there is no filesystem quota, but a home over quota gets the user's sessions closed after the next storage scan.
- **Earth Engine:** `~/.config/earthengine/credentials` exists for users who connected Google; SEPAL's fork reads it in
  `ee.Initialize()`.
- **Language and theme** live only in the GUI's `localStorage` (`sepal:language`: en, es, fr; `sepal:theme`: dark,
  light, system). Same-origin frames can read them; Python cannot.
- **Environment:** the sandbox holds `SEPAL_HOST`, `SEPAL_INSTANCE_TYPE` and `CARTODB_BASEMAP_KEY`. Whether kernels see
  them under `sudo -i` is an experiment.
- **Same-origin third-party code:** both applications run on SEPAL's origin, can call SEPAL's `/api` with the user's
  session, and load code from public CDNs on demand. A security review precedes production.

## GeoLibre

### Approach

**Use GeoLibre's own interface, made SEPAL-aware from inside its web build and the sandbox** (proposed):
1. **Files:** layers refer to `/files/` URLs.
2. **Save and Open:** GeoLibre's own Save, Save As, Open and most exports go to SEPAL. GeoLibre uses the browser's File
   System Access pickers whenever they exist, so a SEPAL implementation of them (the **file-picker adapter**),
   installed before GeoLibre starts, gives its own menus and shortcuts a SEPAL file dialog, with "Download to this
   computer" as an explicit alternative.
3. **A bundled plugin** (public plugin API) adds Add Data › SEPAL, Processing › SEPAL and a jobs panel.
4. **Processing** runs in the job service.
5. **A patched web build,** made by CI from the pinned wheel:
   - a deployment policy: no external plugins, no public sharing;
   - the start-up script (adapter, language, theme);
   - the bundled plugin;
   - browser project history off;
   - the policy failing closed.

**Tradeoffs:**
- five patches against minified, content-hashed files, re-applied at every upgrade;
- an adapter relying on GeoLibre's internal behaviour rather than a contract;
- a few exports and Add Data's file pickers still use the user's computer, labelled;
- long jobs end with the sandbox.

```
 SEPAL GUI ─ app frame: Voilà page ── kernel (app environment) ───────────────────┐
                │                        geolibre.Map widget [upstream]           │
                │                        job service [app]                        │
                └─ GeoLibre frame (patched web build [app], widget's server)      │
                     policy · start-up script · SEPAL plugin                      │
                     ├── /api/sandbox/jupyter/files/…         read, ranges  ─┐    │
                     ├── /api/sandbox/jupyter/api/contents/…  list, save    ─┴ sandbox Jupyter [SEPAL]
                     └── /api/sandbox/jupyter/proxy/<port>/jobs  jobs ───────────┘
```

### User experience

- **Opening the app:**
  - GeoLibre opens from SEPAL's Apps, in SEPAL's language and theme, with its own menus, plus the SEPAL submenus and
    SEPAL's file dialog wherever GeoLibre saves or opens files;
  - no notebook, kernel or URL shows.
- **Opening data:** Add Data › SEPAL › From SEPAL… browses home from `downloads`.
  - Each retrieval is listed once, as its `.vrt`, and prepared copies are marked.
  - An image that reads well (tiles with overviews) is added as one layer, styled with GeoLibre's raster styling. Band
    names or numbers depend on Stage 0 ([band names](#geolibre-specifics)).
  - Otherwise the dialog offers Prepare for viewing, or adding it anyway with a zoomed-in-only warning.
  - Vectors over the supported size are refused with an explanation.
  - GeoLibre's own Add Data stays, labelled "from this computer".
- **Saving:**
  - Save (Ctrl+S) opens SEPAL's dialog at a `GeoLibre` folder or the last one used, and confirms overwrites. Projects
    reference imagery by URL, so they stay small.
  - Save As always asks. Download to this computer is a second button, never the default. Exports through GeoLibre's
    common save path get the same dialog.
  - **A failed save stays unsaved, and nothing downloads unasked:**
    - GeoLibre's browser save (`saveTextFileBrowser`, `file-dialogs.ts:124-159`, and its binary twin) turns any
      non-cancellation error into a local download reported as success (established).
    - The adapter never lets a failure reach that path. SEPAL's dialog shows the error with Retry, Download or Cancel.
    - Cancel is reported as an `AbortError`, so Save returns false and the project stays unsaved
      (`useProjectFileActions.ts:1650-1665`).
    - Download is performed by the adapter, which reports success (as GeoLibre treats downloads) and records that home
      was not updated.
- **Processing** (Processing › SEPAL):
  - **Prepare for viewing** writes a COG beside the image or where chosen, and swaps the layer;
  - **Materialize mosaic** writes one GeoTIFF/COG from a `.vrt`;
  - **Statistics** writes a CSV and optionally adds polygons with their statistics;
  - jobs show progress, estimated size and Cancel in a jobs panel.
- **Returning:**
  - Project › Open restores imagery, styling, polygons and edits, after a closed tab, kernel restart or new sandbox;
  - long jobs reappear while the sandbox lives;
  - missing files show as missing, with "Locate…".
- **Privacy:** no browser project history, no external plugins whatever the browser holds, no sharing to
  `share.geolibre.app`, and [account-bound storage](#browser-storage-bound-to-one-account).

### How each capability is reached

**Kinds:** **config** (deployment policy), **API** (GeoLibre's public plugin or widget API), **custom** (our code),
**patch** (to the web build), **SEPAL** (generic), **upstream** (to request).

| Capability | Kind | Basis |
|---|---|---|
| COG styling (bands, stretches, ramps, classes, nodata) | API | Raster styling, persisted in `metadata.rasterState` / `rasterSymbology` (established) |
| A `.vrt` as one image | API | Plain mosaic `.vrt` read by URL, tiles relative to it (established); through `/files/` (experiment) |
| Band names | custom/upstream | Not read from `.vrt`; `addCogLayer` takes numbers only; `metadata.bandNames` via Python (experiment) |
| Browse home | custom | Plugin dialog over the contents API (experiment) |
| Add raster or vector from SEPAL | API + custom | `addCogLayer(name, url, {bands, colormap, rescale, nodata})`; `addGeoJsonLayer` (inline, size-limited); other vector formats converted by the job service |
| Save, Save As, Open, exports into SEPAL | custom | The adapter and failure handling above; exports outside the common save path still download (established) |
| Drawn and selected geometries | API | `getDrawnFeatures`, `getSelectedFeatures`, `getLayerFeatures`, `onSelectionChange` |
| Menus and panels | API | `registerMenuContribution` (`addData`, `processing`, `controls`), `registerRightPanel` |
| Bundled plugin | patch | Bundled-plugin list compiled empty (established); one-token patch plus the plugin folder |
| No external plugins | config | `plugins: {sideload: false, allowed: []}`; bundled plugins exempt. Installing and loading are separate: installed URLs and bundles in browser storage load unless this refuses them (established) |
| Plugin menus, Undo/Redo kept | config | Keep `plugins:install` and `project:edit` granted (withholding hides every plugin menu, and Undo/Redo); hide installation via `interface.hiddenMenuItems` and `lock` (shortcuts follow capabilities only) |
| No public sharing | config | `sharing.shareUrl: "off"` |
| No browser project history | patch | Written even when embedded, under one shared key; no setting stops it (established) |
| Policy fails closed | patch | `deployment.json` not loaded within 3 s means no policy (established) |
| Language and theme | custom + API | Start-up script reads `sepal:language`/`sepal:theme`; `Map(theme=)` (experiment) |
| Full-resolution processing | custom | Job service |

### GeoLibre specifics

- **Loading** (established):
  - `Map(server_proxy=True)` is required (detection only recognises JupyterHub, else the frame points at
    `127.0.0.1`);
  - the front-end finds `{base}proxy/<port>/` from the page's `jupyter-config-data`;
  - the widget's server answers 304 and serves `.wasm` correctly, and its largest file is 41 MB;
  - `height` must be set for a full-window app;
  - calls awaiting the browser (`to_image`, `get_features`) time out during Voilà's notebook execution, and work only
    in callbacks.
- **Viewing** (established):
  - a `.vrt` is read when it is a plain mosaic (same sources per band; no rescaling, masks or pixel functions; one
    nodata), which `gdalbuildvrt` produces;
  - tiles are read by range, but a tile without overviews draws nothing at low zoom (windows over 2²⁴ samples are
    refused);
  - a striped GeoTIFF is downloaded whole (60 s timeout) and converted in the browser up to 10⁸ samples;
  - Int16, UInt16 and Float32 rendering per engine is an experiment.
- **Band names:**
  - styling reads `metadata.bandNames` (`RasterSymbologySection.tsx`), but `addCogLayer`'s `bands` is numeric only
    (`app-api.ts:380-396`);
  - Stage 0 tries writing `metadata.bandNames` through Python, which must survive the snapshot round trip; otherwise
    an upstream option is needed.
- **Vectors and edits** (established):
  - local vectors are inlined as GeoJSON (refused over 50 MB), and the whole project goes to the kernel 250 ms after
    any change, pans included;
  - tornado caps browser-to-kernel WebSocket messages at 10 MiB, so larger projects are expected to break the
    connection (experiment);
  - every snapshot embeds edited layers in full (`embedEditedGeometry`, `build-project-snapshot.ts:44`), so editing is
    supported below a stated size, and reopening must restore the edits rather than the source file.
- **GeoLibre's own processing does not fit** (established):
  - its sidecar is unreachable as shipped: URL compiled in, proxied requests rejected, half its features desktop-only;
  - its mosaic tool holds the whole mosaic in memory;
  - its zonal statistics read each polygon's bounding box whole, one band at a time;
  - its browser raster tools load whole files.
- **Network at start:** the default basemap from `tiles.openfreemap.org`; no analytics or telemetry with the bundled
  configuration.

**Remaining inconsistencies:**
- Add Data's own pickers stay beside Add Data › SEPAL, labelled.
- Exports bypassing the common save path (charts, processing outputs, Model Builder, Georeferencer, some plugins) are
  hidden or labelled after review.
- SEPAL's entries sit in "SEPAL" submenus: the Project menu cannot be extended without upstream help, which is
  acceptable as native Open already shows SEPAL's dialog.

**Alternatives rejected:**
- **GeoLibre's sidecar:** a rebuilt web build and host-rewriting wrapper just to reach it; desktop-only dialogs;
  outputs not loaded back; whole-image tools; runtimes downloaded on first use.
- **GeoLibre's projects server:** Open and Save As stay local, and it needs absolute HTTPS and a pasted token.
- **Saving only through Python:** GeoLibre's own Save and Open would stay on the user's computer.
- **A parallel SEPAL interface:** it duplicates GeoLibre's menus (used only as Stage 0 scaffolding).
- **SEPAL's `user-files` service:** whole-file downloads by query parameter, so `.vrt` siblings do not resolve.

### Stages

#### Stage 0

The smallest experiment proving that imagery opens, a polygon is processed, GeoLibre's own Save writes into home, and
the project reopens after sandbox replacement. It uses no plugin. Its only change to GeoLibre's files is the start-up
script with the adapter, served from an overlay through the widget's private `serve_app`.
1. A notebook creating `Map(server_proxy=True, layout="full", height="100vh")`, registered in a dev catalog.
2. **Imagery:** add a SEPAL export's `.vrt` by its `/files/` URL, and try `metadata.bandNames`. Record sibling
   resolution, low-zoom behaviour, bytes transferred and memory.
3. **Polygon:** draw one; a temporary button runs statistics on the `.vrt`, including a scaled band, writing a CSV and
   adding the polygon.
4. **Save and Open through the adapter:**
   - Ctrl+S and Project › Save write into home;
   - Cancel leaves the project unsaved;
   - a failed write (a read-only target, or a write refused by the server) shows the error, stays unsaved and
     downloads nothing;
   - Download happens only when chosen;
   - Open reads the project back.
5. **Reopen in a new sandbox:** imagery, styling, the polygon and an edit are restored.

Also recorded: the tiles' layout (`gdalinfo`), masked-pixel values, and whether map activity is seen.

**Early gates:** the plugin is built only after Stage 0 shows that a failed write stays unsaved without downloading,
and that a project saved through GeoLibre's own Save reopens through its own Open after sandbox replacement. These test
the central assumption; if either fails, the design is revisited.

**Recording:** results are recorded in the app repository against the pinned versions: the gates, memory, transfer,
band names and the observations above.

#### Later stages

1. **The patched web build:** policy, start-up script, history off, policy failing closed, empty plugin, with tests that
   each patch applied. Verify against earlier browser state and a slow `deployment.json`.
2. **SEPAL files in GeoLibre's interface:** the plugin's dialog, Add Data › SEPAL, the adapter for all saves, opens and
   exports, and "Locate…", in Chrome, Firefox and Safari.
3. **The job service and workflows:** preparation, mosaics and statistics, with disk, quota and overwrite checks.
4. **Upstream requests,** each retiring a patch or custom piece:
   - an option disabling history;
   - a fail-closed policy;
   - a document-relative sidecar URL;
   - a storage provider hook for Open, Save and Save As;
   - plugin entries in the Project menu;
   - add-by-URL for FlatGeobuf and GeoParquet;
   - band names from `.vrt` files and on `addCogLayer`;
   - saves that report failure instead of downloading;
   - a widget language parameter.

### Acceptance

Beyond the [evaluation brief](#how-the-two-are-evaluated):
- **Preparation:** keeps full-resolution values (checksummed); categorical overviews contain only source classes.
- **Mosaic:** cancellation leaves no partial output.
- **Statistics:**
  - nodata is compared on stored values;
  - scaled bands are reported in physical units;
  - edits after submission do not affect a job.
- **Saving:** a failed write stays unsaved and downloads nothing; Download only when chosen.
- **Privacy:** nothing carries over between accounts (logout, replacement, expiry, second tab, no marker), and no
  external plugin loads.
- **Settings and activity:** SEPAL's language and theme apply; working only in the map keeps the session alive.

**Unresolved:**
- whether Python-written `metadata.bandNames` survives the snapshot round trip;
- how existing exports' encodings are known (presets only, or from the producing recipe while its record exists);
- range requests and contents-API body sizes through the gateway;
- whether root-relative layer URLs survive saving;
- the start-up script in Firefox and Safari;
- how quota is read before a job (no sandbox API is known);
- vector size and editing limits;
- which tools and exports to hide.

## RustGIS

### Approach

RustGIS's own browser interface and map rendering, compiled into a WebAssembly application with SEPAL's browser
integration code, backed by the sandbox's file routes and job service (proposed). It needs no remote desktop and none
of RustGIS's Python widget.

**Evidence:** source inspection only of `v0.3.0` and `main`. References are `v0.3.0` unless marked `main`; nothing was
built or run.

### Architecture

- **Shared interface:** the desktop and web apps wrap the same `rustgis_ui_egui::RustGisApp`, which owns a local engine
  `Session` (`ui-egui/src/lib.rs:408-409`).
- **Commands:** buttons call `app.run(id, json)`. `ui.*` commands go to the interface, the rest to `Session::run`
  through synchronous registered functions, and asynchronous work lands in slots polled each frame.
- **No remote engine or server mode exists.**
- **Platform differences are `Services` hooks** (`lib.rs:91-114`, unchanged on `main`):

| Hook | Stock web build | With integration code |
|---|---|---|
| `open_async(purpose)` → `inbox` of `(name, bytes)` | browser file picker | SEPAL's dialog: projects as bytes, data added by URL instead |
| `download(name, bytes)` | `<a download>` | write into home (see the save contract) |
| `load_pref` / `save_pref` (synchronous strings) | `localStorage`, or memory when embedded | a preferences file in home, doubling as configuration (hidden tabs, plugin registry) |
| `fetch_font` | `assets.rustgis.app` | self-hosted fonts |
| `geolibre_manifests` / `geolibre_run` (files as bytes) | WebAssembly runner from jsDelivr | hidden, or the native runner in the sandbox, still with bytes |

- **The fetcher** (`rustgis_tiles::cache::set_fetcher`) performs every tile, COG, FlatGeobuf, GeoParquet and PMTiles
  range read. The stock one uses `window.fetch` with default credentials, so SEPAL's session cookie goes along.
- **Public API:** `RustGisApp`, `with_services`, `start`, `run`, `logic`, `ui` and the session with its command
  registry are public. `apps/rustgis-web` is binary-only and cannot be imported, but copying it whole is unnecessary
  ([integration code](#integration-code)).
- **Plugins alone are not enough:**
  - WebAssembly plugins have no file access, and only `main`'s `host.fetch` (GET, 2 MiB, public addresses);
  - process plugins are desktop-only;
  - a plugin can add a ribbon tab and panel calling commands the integration code registers.
- **`main` adds:**
  - COG band and range choice (`#bands=…&range=…` in the URL);
  - band-separate COG reads;
  - plugin panels;
  - fetcher interface changes.

### Workflows

**Projects:**
- RustGIS's own Open, Save, Save As and shortcuts go through `open_async("project")` and `download`
  (`lib.rs:1406-1429`, `785-819`).
- Its Save As asks only for a file name, so the integration code asks for the folder once.
- There is no Recent list on the web.

**The save contract, a prerequisite for native Save** (upstream):
- **The problem:** `download` returns nothing, and RustGIS marks the project saved before the write completes, so
  failures go unreported.
- **Needed:**
  - an asynchronous hook given bytes, name, purpose and the project revision, completing with success, failure or
    cancellation;
  - "saved" marked only on success and only for that revision, so edits made during a save stay unsaved;
  - failure and cancellation keeping the project modified, with no download unless chosen;
  - project and sidecar committed consistently ([persistence](#rustgis-persistence)).

**Adding data:**
- RustGIS's Add Data from file embeds bytes.
- Add Data from URL keeps references (`engine/src/cmd/layer.rs:1687-1740`): a tiled `.tif` becomes a COG tile layer,
  indexed FlatGeobuf and GeoParquet are read by range, and PMTiles become a tile layer.
- So SEPAL's dialog adds sandbox files with `ui.addUrl`. There is no folder browser on the web.

**Viewing:**
- COG tile layers read only the overview tiles needed.
- `.vrt` is unreadable and several COGs cannot form one layer, so exports are prepared into one COG with nodata set
  (RustGIS masks only by the file's nodata).
- **Styling:**
  - `v0.3.0` has none for COG layers: the first three bands as RGB, or a fixed 2-98 % stretch;
  - `main` has bands and range through command search or the URL only;
  - neither has ramps, classes, per-band stretches or identify for COG layers.

**Processing:**
- RustGIS's own tools run in the browser on in-memory data, without progress or cancellation, and cannot take COG
  layers; `geolibre_run` in the sandbox would still move bytes through the browser.
- RustGIS has no zonal statistics.
- SEPAL's workflows run in the job service, from commands the integration code registers, through a SEPAL ribbon tab
  declared by a bundled plugin, with the integration code's own progress windows.

**Polygons:**
- Create Polygon adds to the active polygon layer.
- Selection works by click, rectangle, attributes or location (no lasso).
- The integration code reads the geometry from the session at submission.

**Results:** COGs are written into home and added by URL; statistics are a CSV plus a small polygon layer in the
project.

### Large data and state

- **In the browser (the project):** layer references, styling, edits and small results, camera, selection, undo.
- **In the sandbox:** files, prepared COGs, a sidecar per project, jobs.
- **No server-side project:** nothing is rebuilt after a pan.
- **Data held in the project:** non-streamed vectors, uploads and outputs of RustGIS's own tools. The integration adds
  data only by URL.
- **Browser limits:** a 160 MB fetch cache, about 96 MB of decoded COG tiles (soft), 16 MB per request, 256 MB per whole
  download, and a 512 MB project.
- **Multi-band COGs:**
  - in `v0.3.0` a pixel-interleaved COG decodes every band for each tile drawn (10 bands at 512-pixel blocks: about
    670 MB per map tile);
  - `main` reads only the shown bands of a band-separate COG;
  - so RustGIS's prepared COGs are one to three bands at 256-pixel blocks, or band-separate on `main`.

### RustGIS persistence

- **URLs must be absolute:** root-relative tile URLs are dropped on open with only a log warning
  (`engine/src/project.rs:393`). The integration code writes absolute SEPAL URLs, and rewrites the origin before opening
  if the host changed.
- **Styling:** `main` keeps band and range in the URL; `v0.3.0` keeps only opacity, visibility and order.
- **Edits** are embedded in the project; streamed layers need "Load All" before editing.
- **The sidecar:**
  - **Why:** the project format drops unknown keys.
  - **What:** each prepared image's source (`.vrt` and tile fingerprint) and settings.
  - **Immutable prepared files:** paths derive from the source fingerprint and settings (`<folder>/<name>.<hash>.tif`).
    Entries are keyed by that path, since `TileLayer.id` names a catalog entry and is empty for URL-added COGs.
  - **Never replaced:** entries are written once, and files and entries stay while any saved project references them;
    removing unreferenced ones is an explicit cleanup.
  - **Commit order:** the sidecar first, only adding entries, each file written atomically; the project write is the
    commit point, so an interruption leaves the previous project resolvable.
- **Regeneration:** a missing COG is regenerated only while its `.vrt` and every tile exist and match the fingerprint.
  A fingerprint detects change but cannot recover overwritten pixels. On a mismatch, reopening reports the layer as
  unrecoverable, saying what changed, and never silently regenerates different imagery. The user may prepare the
  current source anew, as a new file.
- **No relink:** a COG layer that cannot be read shows no error state (it retries silently every 60 s), so the
  integration code detects and reports missing files.

### Integration code

| Option | Outcome |
|---|---|
| **Stock build in `?embed` mode under a SEPAL page** | RustGIS's own Open, Save and Add Data still use the user's computer |
| **Browser integration code** (proposed): a Rust crate around the public API supplying `Services`, the fetcher, file dialog, commands and job windows | RustGIS's own buttons work against SEPAL, data stays by reference, processing runs in the sandbox |
| **RustGIS's Python widget** | Rejected: the browser posts the whole project after every change, pans included, and the kernel reopens it, re-reading every raster from disk; kernel results are embedded without a cap |
| **A remote engine** (the interface driving a sandbox session) | Every interface-to-engine command made asynchronous upstream; not maintainable as our contribution |

**Size** (estimate from source structure):
- The public API covers start-up, `run`, the mutable session and registry, and `logic`/`ui` in our own frame update.
- The stock shell's 1,390 lines (`main` `e5046e0`) include parts not needed: the embed protocol (178), the browser tool
  runner (144), local-file part reading (93), the assistant's HTTP and URL parameters.
- The estimate is a few hundred lines, mostly ours, with about 150 copied for the fetcher.

**Upstream requests:**
1. **The save contract** (prerequisite).
2. **COG styling** in the interface (bands, stretches, ramps, classes, identify), as a **product gate**.
3. **An integration contract** if the integration code proves fragile: an initialisation hook with mutable access, a
   per-frame hook, and the default browser services as reusable functions. `Services` alone would not suffice.
4. **A picker hook returning URLs or paths.**
5. **Free-form project metadata,** retiring the sidecar.
6. **Relink** and an error state for COG layers.
7. **Later:** references instead of bytes for tool inputs and outputs, with progress and cancellation.

**Building:**
- Rust 1.90+, `wasm32-unknown-unknown`, Trunk 0.21.14 and clang;
- `RUSTGIS_DATA_DIR`, as the build otherwise downloads Natural Earth data without a checksum;
- `Trunk.toml` already builds for sub-paths;
- the published app is 35 MB (12 MB compressed).

**Network at start:** `plugins.rustgis.app/blocklist.json`, always, and the logo and favicon from
`assets.rustgis.app` (to self-host).

### Prototype

Bounded, built on `main` at a pinned commit:
1. **Build** the integration code (recording its size and copied parts) with self-hosted assets, served from a Voilà
   notebook showing only a frame.
2. **Prepare** a real multi-gigabyte export from its `.vrt`, recording time, peak disk and the result's layout.
3. **Display** it by URL, choosing bands and range, and record memory, transfer and frame times over a scripted path,
   for a three-band, a pixel-interleaved 10-band and a band-separate COG.
4. **Statistics** on a drawn polygon from the `.vrt`, checked independently.
5. **Save:**
   - **stock hook:** show that a failed write is reported as saved;
   - **patched hook:** a failed write stays modified and downloads nothing; a cancellation changes nothing; an edit
     during a save stays unsaved; an interruption between sidecar and project leaves the previous project openable;
     re-preparing with new settings and interrupting the save still lets the previous project open and regenerate the
     previous image.
6. **Reopen** after a kernel restart and in a new sandbox: two COG layers with bands and range, the statistics layer
   and an edit are restored. Deleted COGs regenerate independently; a changed source tile is reported, not
   regenerated.
7. **Styling:** record the band, stretch and colour choices users can reach in the interface, against the gate.

**To settle:**
- whether the integration code can draw its own windows cleanly;
- whether a separate crate's WebAssembly build needs extra configuration;
- how prepared COGs draw;
- whether unknown project keys really are dropped.

**Recommendation:**
- **Feasible:** RustGIS can provide an integrated workspace this way.
- **Before production:** the save contract and COG styling upstream, and maintained Rust integration code with a
  WebAssembly build. RustGIS's own tools stay unusable on SEPAL imagery.
- **Prototype conditions:**
  - the save contract demonstrated with a patched hook;
  - sidecar entries keyed by immutable paths;
  - minimal integration code tried before any shell copy;
  - styling recorded against the gate.

## Comparison and decision

| | GeoLibre | RustGIS |
|---|---|---|
| **Our code against** | Public plugin API; browser save and open behaviour (internal, not a contract); private `serve_app` (Stage 0 only) | Public `RustGisApp` and `Services` API |
| **Patches or copies** | Five patches to minified, content-hashed files, re-applied by string matching at each upgrade | A copied fetcher (the whole shell only if minimal code fails) |
| **Build** | Re-packaging the published wheel | Rust and WebAssembly in our CI |
| **Upstream before production** | None; requests retire patches | Save contract and COG styling |
| **Release pace** | Very fast (36 releases in four months) | Fast and young (first released 12 October 2026) |

**For each app repository:**
- a named maintainer;
- automated adapter tests covering ranges and suffix ranges, fingerprints (including a changed tile behind an
  unchanged `.vrt`), project restoration and edits, the save contract, and start-up with the pinned versions;
- acceptance results recorded on a dev SEPAL at each upgrade, which is deliberate given the release pace.

**What remains to establish**, all at runtime:
1. **Transport:** ranges and suffix ranges, `.vrt` siblings, authenticated access, contents-API writes, and URLs
   surviving sandbox replacement.
2. **Large images:** memory, transfer and responsiveness on representative exports; conversion time and peak disk;
   limits agreed beforehand.
3. **Preservation of work:** native Save and Open, failed writes, cancellation, and styling, polygons and edits
   surviving reopening. GeoLibre's early gates test this first.
4. **Processing:** nodata, scale and offset, coordinate transformation and captured edits checked independently; masks
   and reads within memory.
5. **Lifecycle and accounts:** detached jobs after kernel shutdown, cancellation cleanup, account changes across tabs,
   policy enforcement, and nested-frame activity.
6. **Maintenance:** GeoLibre's actual patch burden, the RustGIS integration code's actual size, ownership, and whether
   RustGIS's upstream prerequisites are achievable.

**Platform checks** bearing on both:
- the jupyter-server-proxy version in the image;
- kernel environment variables;
- the GUI's CSP in the Voilà page;
- delivery of Voilà's shutdown beacon;
- orphaned kernels after failed renders;
- Earth Engine tiles without authentication.

**Decision:** evaluate both comparably, GeoLibre through Stage 0 and its gates first, RustGIS through its bounded
prototype, and decide on production from measured results judged by the [evaluation brief](#evaluation-brief).
