-- ============================================================================
-- Migration: 005_create_data_tables.sql
-- Description: Create fact table for indicator values
-- Created: 2025-12-09
-- ============================================================================

SET search_path TO data, public;

-- ============================================================================
-- INDICATOR VALUE (FACT TABLE)
-- ============================================================================

CREATE TABLE IF NOT EXISTS data.indicator_value (
    indicator_id INTEGER NOT NULL,
    time_id INTEGER NOT NULL,
    scenario_id INTEGER NOT NULL,
    entity_code TEXT NOT NULL,
    raw_value NUMERIC,
    value_0_100 NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    PRIMARY KEY (indicator_id, time_id, scenario_id, entity_code)
);

COMMENT ON TABLE data.indicator_value IS 'Fact table storing raw indicator values for each entity/time/scenario combination';
COMMENT ON COLUMN data.indicator_value.indicator_id IS 'Foreign key to catalog.indicator(id)';
COMMENT ON COLUMN data.indicator_value.time_id IS 'Foreign key to dim.time(id)';
COMMENT ON COLUMN data.indicator_value.scenario_id IS 'Foreign key to dim.scenario(id)';
COMMENT ON COLUMN data.indicator_value.entity_code IS 'Municipality code (references admin.local_municipality_2018.code)';
COMMENT ON COLUMN data.indicator_value.raw_value IS 'Original/raw indicator value';
COMMENT ON COLUMN data.indicator_value.value_0_100 IS 'Normalized value on 0-100 scale (null for raw imports)';

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Indexes on individual foreign key columns for efficient lookups
CREATE INDEX IF NOT EXISTS idx_indicator_value_indicator ON data.indicator_value(indicator_id);
CREATE INDEX IF NOT EXISTS idx_indicator_value_time ON data.indicator_value(time_id);
CREATE INDEX IF NOT EXISTS idx_indicator_value_scenario ON data.indicator_value(scenario_id);
CREATE INDEX IF NOT EXISTS idx_indicator_value_entity ON data.indicator_value(entity_code);

-- Composite index for common query pattern (indicator + time + scenario)
CREATE INDEX IF NOT EXISTS idx_indicator_value_composite ON data.indicator_value(indicator_id, time_id, scenario_id);

-- ============================================================================
-- FOREIGN KEY CONSTRAINTS (OPTIONAL)
-- ============================================================================

-- Note: Foreign keys are commented out by default for better import performance.
-- Uncomment if referential integrity enforcement is required for your use case.

-- ALTER TABLE data.indicator_value
--     ADD CONSTRAINT fk_indicator_value_indicator
--     FOREIGN KEY (indicator_id) REFERENCES catalog.indicator(id) ON DELETE CASCADE;

-- ALTER TABLE data.indicator_value
--     ADD CONSTRAINT fk_indicator_value_time
--     FOREIGN KEY (time_id) REFERENCES dim.time(id) ON DELETE CASCADE;

-- ALTER TABLE data.indicator_value
--     ADD CONSTRAINT fk_indicator_value_scenario
--     FOREIGN KEY (scenario_id) REFERENCES dim.scenario(id) ON DELETE CASCADE;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION data.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_indicator_value_timestamp ON data.indicator_value;

-- Apply timestamp trigger
CREATE TRIGGER trigger_indicator_value_timestamp
    BEFORE UPDATE ON data.indicator_value
    FOR EACH ROW
    EXECUTE FUNCTION data.update_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'data' AND table_name = 'indicator_value') THEN
        RAISE NOTICE '✓ data.indicator_value table exists';
    ELSE
        RAISE WARNING '⚠ data.indicator_value table not found';
    END IF;

    -- Verify composite primary key exists
    IF EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'data'
        AND tablename = 'indicator_value'
        AND indexname = 'indicator_value_pkey'
    ) THEN
        RAISE NOTICE '✓ Composite primary key exists';
    ELSE
        RAISE WARNING '⚠ Primary key constraint not found';
    END IF;
END $$;
