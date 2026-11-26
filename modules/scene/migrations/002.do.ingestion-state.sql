-- Ingestion state lives beside the catalogue it describes: a rebuild's publication and each STAC page
-- commit together with it, and a restored dump resumes from the state it was dumped with.

-- The most recent acquisition ingested per dataset, which STAC updates query from. A missing one is derived
-- from the catalogue on first use.
CREATE TABLE checkpoint (
    dataset          varchar(255) NOT NULL,
    last_acquisition timestamptz  NOT NULL,
    PRIMARY KEY (dataset)
);

-- One row once a CSV rebuild has published. Deleting it rebuilds the catalogue on the next start.
CREATE TABLE catalogue (
    singleton   boolean     NOT NULL DEFAULT true CHECK (singleton),
    initialized timestamptz NOT NULL,
    PRIMARY KEY (singleton)
);

-- An existing catalogue carries on without a rebuild.
INSERT INTO catalogue (initialized)
SELECT now() WHERE EXISTS (SELECT 1 FROM scene);
