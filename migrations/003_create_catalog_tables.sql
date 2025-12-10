-- ============================================================================
-- Migration: 003_create_catalog_tables.sql
-- Description: Create catalog table for indicator definitions
-- Created: 2025-12-09
-- ============================================================================

SET search_path TO catalog, public;

-- ============================================================================
-- INDICATOR CATALOG
-- ============================================================================

CREATE TABLE IF NOT EXISTS catalog.indicator (
    id SERIAL PRIMARY KEY,
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    category TEXT,
    unit TEXT,
    polarity TEXT DEFAULT 'neutral',
    description TEXT,
    sort_order INTEGER,
    measure_type TEXT NOT NULL DEFAULT 'indicator',
    theme TEXT,
    source_name TEXT,
    source_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    CONSTRAINT chk_polarity CHECK (polarity IN ('positive', 'negative', 'neutral', 'adverse')),
    CONSTRAINT chk_measure_type CHECK (measure_type IN ('indicator', 'index', 'component'))
);

COMMENT ON TABLE catalog.indicator IS 'Master catalog of all indicators and metrics';
COMMENT ON COLUMN catalog.indicator.id IS 'Auto-incrementing primary key';
COMMENT ON COLUMN catalog.indicator.key IS 'Unique indicator identifier (e.g., crime_murder, pop_total)';
COMMENT ON COLUMN catalog.indicator.label IS 'Human-readable indicator name';
COMMENT ON COLUMN catalog.indicator.category IS 'Indicator category grouping';
COMMENT ON COLUMN catalog.indicator.unit IS 'Measurement unit (e.g., "cases (raw count)", "%", "per 100k")';
COMMENT ON COLUMN catalog.indicator.polarity IS 'Directional interpretation: positive (higher is better), negative (lower is better), neutral, adverse';
COMMENT ON COLUMN catalog.indicator.measure_type IS 'Type of measure: indicator (raw metric), index (composite), component (sub-index)';
COMMENT ON COLUMN catalog.indicator.theme IS 'Thematic grouping (e.g., "Contact crimes", "Sexual Offences")';
COMMENT ON COLUMN catalog.indicator.source_name IS 'Data source attribution';
COMMENT ON COLUMN catalog.indicator.source_url IS 'URL to source documentation';

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_indicator_key ON catalog.indicator(key);
CREATE INDEX IF NOT EXISTS idx_indicator_theme ON catalog.indicator(LOWER(theme));
CREATE INDEX IF NOT EXISTS idx_indicator_measure_type ON catalog.indicator(measure_type);
CREATE INDEX IF NOT EXISTS idx_indicator_category ON catalog.indicator(category);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION catalog.update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp trigger
CREATE TRIGGER trigger_indicator_timestamp
    BEFORE UPDATE ON catalog.indicator
    FOR EACH ROW
    EXECUTE FUNCTION catalog.update_timestamp();

-- ============================================================================
-- VERIFICATION
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'catalog' AND table_name = 'indicator') THEN
        RAISE NOTICE '✓ catalog.indicator table exists';
    ELSE
        RAISE WARNING '⚠ catalog.indicator table not found';
    END IF;
END $$;
