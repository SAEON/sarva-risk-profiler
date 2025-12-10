-- ============================================================================
-- Migration: 004_create_admin_tables.sql
-- Description: Create administrative boundary table with PostGIS geometry support
-- Created: 2025-12-09
-- ============================================================================

SET search_path TO admin, public;

-- ============================================================================
-- LOCAL MUNICIPALITY 2018 (MASTER TABLE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS admin.local_municipality_2018 (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    district_or_metro_code TEXT,
    demarcation_year INTEGER NOT NULL DEFAULT 2018,
    area_km2 NUMERIC NOT NULL,
    geom GEOMETRY(MultiPolygon, 4326) NOT NULL,
    code_raw TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE admin.local_municipality_2018 IS 'Master table for South African local municipality boundaries (2018 demarcation)';
COMMENT ON COLUMN admin.local_municipality_2018.code IS 'Standardized municipality code (e.g., JHB, CPT, ETH)';
COMMENT ON COLUMN admin.local_municipality_2018.name IS 'Official municipality name';
COMMENT ON COLUMN admin.local_municipality_2018.district_or_metro_code IS 'Parent district or metro code';
COMMENT ON COLUMN admin.local_municipality_2018.geom IS 'PostGIS geometry - MultiPolygon in WGS84 (EPSG:4326)';
COMMENT ON COLUMN admin.local_municipality_2018.code_raw IS 'Original code from source data before standardization';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary key index on code (created automatically by PRIMARY KEY constraint)

-- Index on name for search/autocomplete
CREATE INDEX IF NOT EXISTS idx_lm2018_name ON admin.local_municipality_2018(name);

-- Index on district for filtering
CREATE INDEX IF NOT EXISTS idx_lm2018_district ON admin.local_municipality_2018(district_or_metro_code);

-- Spatial index on geometry (critical for map performance and spatial queries)
CREATE INDEX IF NOT EXISTS lm2018_geom_gix ON admin.local_municipality_2018 USING GIST(geom);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION admin.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_lm2018_timestamp ON admin.local_municipality_2018;

-- Apply timestamp trigger
CREATE TRIGGER trigger_lm2018_timestamp
    BEFORE UPDATE ON admin.local_municipality_2018
    FOR EACH ROW
    EXECUTE FUNCTION admin.update_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'admin' AND table_name = 'local_municipality_2018') THEN
        RAISE NOTICE '✓ admin.local_municipality_2018 table exists';
    ELSE
        RAISE WARNING '⚠ admin.local_municipality_2018 table not found';
    END IF;

    -- Verify spatial index exists
    IF EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'admin' AND tablename = 'local_municipality_2018' AND indexname = 'lm2018_geom_gix') THEN
        RAISE NOTICE '✓ Spatial index exists on geometry column';
    ELSE
        RAISE WARNING '⚠ Spatial index not found - may impact query performance';
    END IF;
END $$;
