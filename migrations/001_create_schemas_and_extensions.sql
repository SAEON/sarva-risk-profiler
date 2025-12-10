-- ============================================================================
-- Migration: 001_create_schemas_and_extensions.sql
-- Description: Create database schemas and enable PostGIS extension
-- Created: 2025-12-09
-- Note: Only creates schemas and tables actually used by the application
-- ============================================================================

-- Enable PostGIS extension if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- CREATE SCHEMAS (ONLY USED SCHEMAS)
-- ============================================================================

-- Admin schema: Administrative boundaries and reference data
CREATE SCHEMA IF NOT EXISTS admin;
COMMENT ON SCHEMA admin IS 'Administrative boundaries and municipality data';

-- Catalog schema: Metadata for indicators
CREATE SCHEMA IF NOT EXISTS catalog;
COMMENT ON SCHEMA catalog IS 'Metadata catalog for indicators';

-- Data schema: Fact tables for indicator values
CREATE SCHEMA IF NOT EXISTS data;
COMMENT ON SCHEMA data IS 'Fact tables storing indicator values';

-- Dim schema: Dimension tables for time and scenarios
CREATE SCHEMA IF NOT EXISTS dim;
COMMENT ON SCHEMA dim IS 'Dimension tables for time periods and scenarios';

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
DECLARE
    schema_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO schema_count
    FROM information_schema.schemata
    WHERE schema_name IN ('admin', 'catalog', 'data', 'dim');

    IF schema_count = 4 THEN
        RAISE NOTICE '✓ All 4 schemas exist (admin, catalog, data, dim)';
    ELSE
        RAISE NOTICE '⚠ Found % schemas (expected 4)', schema_count;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') THEN
        RAISE NOTICE '✓ PostGIS extension is enabled';
    ELSE
        RAISE WARNING '⚠ PostGIS extension not found';
    END IF;
END $$;
