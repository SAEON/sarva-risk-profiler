const { pool } = require('../../db/pool');

/**
 * Import records into database using UPSERT strategy
 * @param {Array} records - Array of validated records
 * @returns {Object} { inserted, updated }
 */
async function importRecords(records) {
  if (records.length === 0) {
    return { inserted: 0, updated: 0 };
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let inserted = 0;
    let updated = 0;

    // Use UPSERT for each record
    for (const record of records) {
      const result = await client.query(`
        INSERT INTO data.indicator_value
          (indicator_id, time_id, scenario_id, entity_code, raw_value, value_0_100)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (indicator_id, time_id, scenario_id, entity_code)
        DO UPDATE SET
          raw_value = EXCLUDED.raw_value,
          value_0_100 = EXCLUDED.value_0_100
        RETURNING (xmax = 0) AS inserted
      `, [
        record.indicator_id,
        record.time_id,
        record.scenario_id,
        record.entity_code,
        record.raw_value,
        record.value_0_100
      ]);

      // xmax = 0 means INSERT, otherwise UPDATE
      if (result.rows[0].inserted) {
        inserted++;
      } else {
        updated++;
      }
    }

    await client.query('COMMIT');

    return { inserted, updated };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { importRecords };
