-- ============================================================================
-- Migration: 002_create_dimension_tables.sql
-- Description: Create dimension tables for time periods and scenarios
-- Created: 2025-12-09
-- ============================================================================

SET search_path TO dim, public;

-- ============================================================================
-- SCENARIO DIMENSION
-- ============================================================================

CREATE TABLE IF NOT EXISTS dim.scenario (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

COMMENT ON TABLE dim.scenario IS 'Dimension table for data scenarios (e.g., saps_actual, baseline)';
COMMENT ON COLUMN dim.scenario.id IS 'Auto-incrementing primary key';
COMMENT ON COLUMN dim.scenario.key IS 'Unique scenario identifier (e.g., saps_actual, baseline)';
COMMENT ON COLUMN dim.scenario.label IS 'Human-readable scenario name';

-- ============================================================================
-- TIME DIMENSION
-- ============================================================================

CREATE TABLE IF NOT EXISTS dim.time (
    id SERIAL PRIMARY KEY,
    period INTEGER NOT NULL,
    granularity TEXT NOT NULL DEFAULT 'year',
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT time_period_granularity_unique UNIQUE (period, granularity)
);

COMMENT ON TABLE dim.time IS 'Dimension table for time periods (years, quarters, months)';
COMMENT ON COLUMN dim.time.id IS 'Auto-incrementing primary key';
COMMENT ON COLUMN dim.time.period IS 'Time period value (e.g., 2024 for year)';
COMMENT ON COLUMN dim.time.granularity IS 'Time granularity: year, quarter, month';
COMMENT ON COLUMN dim.time.label IS 'Human-readable time label (e.g., "2024")';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_scenario_key ON dim.scenario(key);
CREATE INDEX IF NOT EXISTS idx_time_period ON dim.time(period);
CREATE INDEX IF NOT EXISTS idx_time_granularity ON dim.time(granularity);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION dim.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing triggers if they exist
DROP TRIGGER IF EXISTS trigger_scenario_timestamp ON dim.scenario;
DROP TRIGGER IF EXISTS trigger_time_timestamp ON dim.time;

-- Apply timestamp trigger to scenario
CREATE TRIGGER trigger_scenario_timestamp
    BEFORE UPDATE ON dim.scenario
    FOR EACH ROW
    EXECUTE FUNCTION dim.update_timestamp();

-- Apply timestamp trigger to time
CREATE TRIGGER trigger_time_timestamp
    BEFORE UPDATE ON dim.time
    FOR EACH ROW
    EXECUTE FUNCTION dim.update_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'dim' AND table_name = 'scenario') THEN
        RAISE NOTICE '✓ dim.scenario table exists';
    ELSE
        RAISE WARNING '⚠ dim.scenario table not found';
    END IF;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'dim' AND table_name = 'time') THEN
        RAISE NOTICE '✓ dim.time table exists';
    ELSE
        RAISE WARNING '⚠ dim.time table not found';
    END IF;
END $$;
