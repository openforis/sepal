package org.openforis.sepal.scene.management

import groovy.sql.Sql
import org.openforis.sepal.metadata.MetadataProvider
import org.openforis.sepal.scene.DataSet
import org.openforis.sepal.transaction.SqlConnectionProvider

interface DataSetRepository {

    boolean containsDataSetWithId(int id)
    List<MetadataProvider> getMetadataProviders()
    def updateCrawlingStartTime(int providerId, Date starTime)
    def updateCrawlingEndTime(int providerId, Date endTime)

}

class JdbcDataSetRepository implements DataSetRepository {
    private final SqlConnectionProvider connectionProvider

    JdbcDataSetRepository(SqlConnectionProvider connectionProvider) {
        this.connectionProvider = connectionProvider
    }

    boolean containsDataSetWithId(int id) {
        def row = sql.firstRow('SELECT * FROM data_set WHERE id = ? AND dataset_active = 1', [id])
        return row != null
    }

@Override
    List<MetadataProvider> getMetadataProviders() {
        List<MetadataProvider> providers = new ArrayList<MetadataProvider>()
        sql.eachRow('''
            SELECT mp.id,mp.name,mp.crawling_entrypoint,mp.iterations,mp.iteration_size,
            mp.last_execution_start,mp.last_execution_end,ds.id AS datasetId
            FROM metadata_providers mp
            INNER JOIN data_set ds ON mp.id = ds.metadata_provider
            WHERE mp.active = 1 AND ds.dataset_active = 1
          '''
          ){
            mapMetadataProvider(it,providers)
          }

        return providers;
    }

    @Override
    def updateCrawlingStartTime(int providerId, Date starTime) {
        sql.executeUpdate('UPDATE metadata_providers SET last_execution_start = ? WHERE id = ?',[starTime,providerId])
    }

    @Override
    def updateCrawlingEndTime(int providerId, Date endTime) {
        sql.executeUpdate('UPDATE metadata_providers SET last_execution_end = ? WHERE id = ?',[endTime,providerId])
    }

    private def mapMetadataProvider(row, List<MetadataProvider> providers){
        def provider = new MetadataProvider(
                id: row.id, name: row.name,active: true,entrypoint: row.crawling_entrypoint,iterations: row.iterations, iterationSize: row.iteration_size,
                lastStartTime: row.last_execution_start, lastEndTime: row.last_execution_end
        )
        if (! (providers.contains(provider))){
            providers.add(provider)
        }else{
            provider = providers.find(it.id == provider.id)
        }
        provider.dataSets.add(DataSet.byId(row.datasetId))
    }

    private Sql getSql() {
        connectionProvider.sql
    }
}
