--
-- PostgreSQL database dump
-- Exported by Node.js ETL script
--
-- Database: sa_risk
-- Table: dim.scenario
--

SET search_path TO dim, public;

--
-- Data for Name: scenario; Type: TABLE DATA; Schema: dim
--

INSERT INTO dim.scenario (id, key, label) VALUES (1, 'census 2022', 'census 2022');
INSERT INTO dim.scenario (id, key, label) VALUES (3, 'census 2011', 'census 2011');
INSERT INTO dim.scenario (id, key, label) VALUES (4, 'census 2001', 'census 2001');
INSERT INTO dim.scenario (id, key, label) VALUES (5, 'census 1996', 'census 1996');
INSERT INTO dim.scenario (id, key, label) VALUES (6, 'saps_actual', 'SAPS actual (observed)');
INSERT INTO dim.scenario (id, key, label) VALUES (7, 'actual', 'Actual');

