const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const app = express();
const port = 3000;

// Database configuration (hardcoded)
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'new_employee_db',
    password: 'Password@12345',
    port: 5432,
});

// Middleware
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// Test endpoint
app.get('/test', (req, res) => {
    res.json({ status: 'Server is running', timestamp: new Date().toISOString() });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'Server is running', port: port });
});

// Test database connection
async function testDatabaseConnection() {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('Database connection successful:', res.rows[0].now);
        return true;
    } catch (err) {
        console.error('Database connection failed:', err.message);
        throw err;
    }
}

// Initialize database
async function initializeDatabase() {
    try {
        await testDatabaseConnection();
        await pool.query(`
            Drop table if exists asset_requests;
            CREATE TABLE IF NOT EXISTS asset_requests (
                id SERIAL PRIMARY KEY,
                employee_id VARCHAR(50) NOT NULL,
                employee_name VARCHAR(100) NOT NULL,
                email VARCHAR(50) NOT NULL,
                request_date DATE NOT NULL,
                asset_type VARCHAR(50) NOT NULL,
                asset_name VARCHAR(40) NOT NULL,
                details TEXT NOT NULL,
                status VARCHAR(20) DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        await pool.query(`
            INSERT INTO asset_requests (employee_id, employee_name, email, request_date, asset_type, asset_name, details, status)
            VALUES ('EMP001', 'John Doe', 'john.doe@company.com', CURRENT_DATE, 'Laptop', 'MacBook Pro', 'Need for development work', 'Pending')
            ON CONFLICT DO NOTHING;
        `);
        console.log('Database table initialized with sample data');
    } catch (err) {
        console.error('Error initializing database:', err.message);
    }
}

// Initialize database
initializeDatabase();

// Serve employee.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'aasset.html'));
});

// Serve hr.html
app.get('/hr', (req, res) => {
    res.sendFile(path.join(__dirname, 'hrpage.html'));
});

// Get all asset requests
app.get('/api/requests', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM asset_requests ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error fetching requests:', err.message);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

// Create a new asset request
app.post('/api/requests', async (req, res) => {
    const { employeeId, employeeName, email, requestDate, assetType, assetName, details } = req.body;
    if (!employeeId || !employeeName || !email || !requestDate || !assetType || !assetName || !details) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO asset_requests (employee_id, employee_name, email, request_date, asset_type, asset_name, details)
             VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
            [employeeId, employeeName, email, requestDate, assetType, assetName, details]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating request:', err.message);
        res.status(500).json({ error: 'Failed to submit request', details: err.message });
    }
});

// Update request status
app.put('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!status || !['Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ error: 'Valid status (Approved or Rejected) is required' });
    }
    try {
        const result = await pool.query(
            'UPDATE asset_requests SET status = $1 WHERE id = $2 RETURNING *',
            [status, id]
        );
        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Request not found' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error updating request:', err.message);
        res.status(500).json({ error: 'Failed to update request', details: err.message });
    }
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

// Start server
try {
    app.listen(port, () => {
        console.log(`Server running on http://localhost:${port}`);
        console.log(`Employee Dashboard: http://localhost:${port}/`);
        console.log(`HR Dashboard: http://localhost:${port}/hr`);
        console.log(`API Endpoints:`);
        console.log(`- GET /test`);
        console.log(`- GET /health`);
        console.log(`- GET /api/requests`);
        console.log(`- POST /api/requests`);
        console.log(`- PUT /api/requests/:id`);
        console.log(`- GET /`);
        console.log(`- GET /hr`);
    });
} catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
}