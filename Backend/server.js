require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const retry = require('async-retry');

const app = express();
const port = process.env.PORT || 3086;

// Database configuration
const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'postgres',
  database: process.env.DB_NAME || 'new_employee_db',
  password: process.env.DB_PASSWORD || 'admin123',
  port: process.env.DB_PORT || 5432,
};

// Create database pool with retry logic
const createPool = async () => {
  return await retry(
    async () => {
      const pool = new Pool(dbConfig);
      console.log('Attempting to connect to database...');
      const client = await pool.connect();
      client.release();
      console.log('Successfully connected to database');
      return pool;
    },
    {
      retries: 5,
      minTimeout: 2000,
      onRetry: (error) => {
        console.log(`Database connection failed, retrying... (${error.message})`);
      },
    }
  );
};

// Initialize application
const initApp = async () => {
  try {
    const pool = await createPool();

    // Middleware
    app.use(cors({
      origin: ['http://16.170.224.87:8299', 'http://16.170.224.87:8300'],
      methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
      allowedHeaders: ['Content-Type']
    }));
    app.use(express.json());

    // Health check endpoint
    app.get('/api/health', (req, res) => {
      res.status(200).json({ status: 'OK', database: 'Connected' });
    });

    // Get all requests (for HR page)
    app.get('/api/requests', async (req, res) => {
      try {
        const { employee_id } = req.query;
        let query = 'SELECT * FROM asset_requests';
        let params = [];
        
        if (employee_id) {
          query += ' WHERE employee_id = $1';
          params.push(employee_id);
        }
        
        query += ' ORDER BY created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows);
      } catch (err) {
        console.error('Error fetching requests:', err);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Create new request
    app.post('/api/requests', async (req, res) => {
      try {
        const {
          employee_id,
          employee_name,
          email,
          request_date,
          asset_type,
          asset_name,
          details,
        } = req.body;

        // Basic validation
        if (!employee_id || !employee_name || !email || !request_date || !asset_type || !asset_name || !details) {
          return res.status(400).json({ error: 'All fields are required' });
        }

        const result = await pool.query(
          `INSERT INTO asset_requests 
          (employee_id, employee_name, email, request_date, asset_type, asset_name, details, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [employee_id, employee_name, email, request_date, asset_type, asset_name, details, 'Pending']
        );

        res.status(201).json(result.rows[0]);
      } catch (err) {
        console.error('Error creating request:', err);
        res.status(500).json({ error: 'Failed to submit request' });
      }
    });

    // Update request status (for HR page)
    app.put('/api/requests/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
          return res.status(400).json({ error: 'Invalid status' });
        }

        const result = await pool.query(
          'UPDATE asset_requests SET status = $1 WHERE id = $2 RETURNING *',
          [status, id]
        );

        if (result.rowCount === 0) {
          return res.status(404).json({ error: 'Request not found' });
        }

        res.json(result.rows[0]);
      } catch (err) {
        console.error('Error updating request:', err);
        res.status(500).json({ error: 'Failed to update request' });
      }
    });

    // Initialize database table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS asset_requests (
        id SERIAL PRIMARY KEY,
        employee_id VARCHAR(7),
        employee_name VARCHAR(40),
        email VARCHAR(40),
        request_date DATE,
        asset_type VARCHAR(50),
        asset_name VARCHAR(30),
        details VARCHAR(150),
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Start server
    app.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
    });
  } catch (err) {
    console.error('Failed to initialize application:', err);
    process.exit(1);
  }
};

initApp();