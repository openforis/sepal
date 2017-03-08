ALTER TABLE scene_meta_data
  ADD COLUMN coverage DOUBLE DEFAULT 100 NOT NULL;
ALTER TABLE scene_meta_data
  ADD COLUMN footprint TEXT;