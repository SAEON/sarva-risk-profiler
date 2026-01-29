/**
 * Domain configuration for different data import types
 * Each domain defines its own sheet names, column prefixes, scenarios, and validation rules
 */

const domainConfigs = {
  'crime-stats': {
    sheetName: 'Crime_Data',
    columnPrefix: 'Crime_',
    defaultScenario: 'saps_actual',
    allowZero: false, // Zero means no data for crime stats
    category: 'SAPS crime category',
    indicatorSource: 'json', // Uses tmp/crime_indicators.json
    description: 'SAPS crime statistics by municipality'
  },
  'socio-economic': {
    sheetName: 'Socio_Economic_Data',
    columnPrefix: 'Socio_',
    defaultScenario: 'census 2022',
    allowZero: true, // Zero is valid for percentages (e.g., 0% higher education)
    category: 'socio-economic',
    indicatorSource: 'database', // Query catalog.indicator where category='socio-economic'
    validScenarios: ['census 2022', 'census 2011', 'census 2001', 'census 1996'],
    description: 'Census demographic and socio-economic indicators'
  }
};

/**
 * Get configuration for a specific domain
 * @param {string} domain - Domain name (e.g., 'crime-stats', 'socio-economic')
 * @returns {Object} Domain configuration
 */
function getDomainConfig(domain) {
  const config = domainConfigs[domain];
  if (!config) {
    throw new Error(`Unknown import domain: ${domain}. Valid domains: ${Object.keys(domainConfigs).join(', ')}`);
  }
  return config;
}

/**
 * Get all available domains
 * @returns {string[]} Array of domain names
 */
function getAvailableDomains() {
  return Object.keys(domainConfigs);
}

module.exports = {
  domainConfigs,
  getDomainConfig,
  getAvailableDomains
};