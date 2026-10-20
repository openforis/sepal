# Exporting notebook Earth Engine objects

`pysepal-api` can submit an `ee.Image` or `ee.FeatureCollection` through SEPAL's task manager. Install `pysepal-api[ee]` in the notebook environment, then use the existing client helpers:

```python
from pysepal_api import SepalClient

with SepalClient() as sepal:
    task = sepal.ee_exports.submit_image(
        image=image,
        region=region,
        destination="SEPAL",
        name="ndvi",
        scale=30,
        workspace_path="module_results/demo/exports",
        filename_prefix="ndvi",
    )
    sepal.tasks.wait(task.id)

    task = sepal.ee_exports.submit_table(
        collection=plots,
        destination="GEE",
        name="plots",
        asset_id="projects/my-project/assets/plots",
    )
    sepal.tasks.wait(task.id)
```

Both helpers support `GEE`, `DRIVE`, and `SEPAL`. Use `asset_id` for GEE, `drive_folder` for Drive, or a `workspace_path` relative to the SEPAL home directory. Without a workspace path, files go into `downloads/<name>`. Drive folders live under SEPAL's export folder; nested folder names are flattened by the existing exporter. Asset and Drive exports require a Google account; workspace exports also support users exporting through SEPAL's service account. The async client exposes the same helpers with `await`.

The client serializes objects as Cloud API expression dictionaries and submits `operation="ee.export"` through `POST /api/tasks`. The task runner starts the authenticated GEE job at `/task/export/ee`, which decodes the objects and calls the existing image/table exporters without changing their interfaces. Table exports to Drive use a new adapter because there is no existing table-to-Drive helper. The runner follows progress and cancellation through the existing task operation routes. After a successful workspace submission, it downloads through a local processing slot and cleans up temporary storage after completion, failure or cancellation. Submission failures retain the existing exporters' cleanup behavior.

Image exports to an `ImageCollection` asset require the tiled recipe workflow and are rejected by this object adapter. Workspace images are downloaded as the files produced by Earth Engine; the adapter does not create a recipe VRT.

The adapter follows the existing exporters' parameter support and behavior. Image file prefixes map to the exporters' description field; the task-manager title still uses the supplied name. Asset table selectors are applied to the collection before export. Workspace CSV tables retain the existing automatic `.geo` geometry column. `max_vertices` is supported for table-to-Drive exports and rejected for asset/workspace tables, whose existing exporters cannot apply it.

Deploy the updated **gee** and **task** images together before using these helpers against a SEPAL installation. The Python client API is unchanged. Automated tests mock Earth Engine and storage; they do not validate a deployed installation or submit live exports.
