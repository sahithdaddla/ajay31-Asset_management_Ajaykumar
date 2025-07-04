const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();
const port = 3086;

// Database configuration
const pool = new Pool({
    user: 'postgres',
    host: 'postgres',
    database: 'new_employee_db',
    password: 'admin123',
    port: 5432,
});

// Middleware
app.use(cors({
    origin: ['http://16.170.245.69:3086', 
        'http://127.0.0.1:5500',
         'http://localhost:5500',
         'http://127.0.0.1:5502',
         'http://127.0.0.1:5503',
          'http://16.170.245.69:8299',
          'http://16.170.245.69:8300'],
    methods: ['GET', 'POST', 'PUT', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
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

// Initialize database
async function initializeDatabase() {
    try {
        console.log('Creating asset_requests table...');
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
            );
        `);
        await pool.query(`
            INSERT INTO asset_requests (employee_id, employee_name, email, request_date, asset_type, asset_name, details, status)
            VALUES ('ATS0123', 'John Doe', 'john.doe@gmail.com', CURRENT_DATE, 'Laptop', 'MacBook Pro', 'Need for development work', 'Approved')
            ON CONFLICT DO NOTHING;
        `);
        console.log('Database table initialized with sample data');
    } catch (err) {
        console.error('Error initializing database:', err.message);
        throw err;
    }
}

// Test database connection
async function testDatabaseConnection() {
    try {
        const res = await pool.query('SELECT NOW()');
        console.log('Database connection successful:', res.rows[0].now);
        await initializeDatabase();
    } catch (err) {
        console.error('Database connection failed:', err.message);
        throw err;
    }
}

// Serve employee.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'aasset.html'));
});

// Serve hr.html
app.get('/hr', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'hrpage.html'));
});

// Get all asset requests
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
        console.error('Error fetching requests:', err.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create a new asset request
app.post('/api/requests', async (req, res) => {
    const { employee_id, employee_name, email, request_date, asset_type, asset_name, details, status } = req.body;
    if (!employee_id || !employee_name || !email || !request_date || !asset_type || !asset_name || !details) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    if (!/^ATS0[0-9]{3}$/.test(employee_id) || employee_id === 'ATS0000') {
        return res.status(400).json({ error: 'Invalid employee ID format' });
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9\-_\.]{1,28}[a-zA-Z0-9]@gmail\.com$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    if (!/^[A-Za-z]+( [A-Za-z]+)*$/.test(employee_name) || employee_name.length < 3 || employee_name.length > 40) {
        return res.status(400).json({ error: 'Invalid employee name format' });
    }
    if (asset_name.length < 2 || asset_name.length > 30) {
        return res.status(400).json({ error: 'Invalid asset name format' });
    }
    if (details.length < 10 || details.length > 150) {
        return res.status(400).json({ error: 'Invalid details format' });
    }
    try {
        const result = await pool.query(
            `INSERT INTO asset_requests (employee_id, employee_name, email, request_date, asset_type, asset_name, details, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
            [employee_id, employee_name, email, request_date, asset_type, asset_name, details, status || 'Pending']
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error creating request:', err.message);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

// Update request status
app.put('/api/requests/:id', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    if (!['Pending', 'Approved', 'Rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
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
        res.status(500).json({ error: 'Failed to update request' });
    }
});

// Handle 404
app.use((req, res) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.url}` });
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
testDatabaseConnection().then(() => {
    app.listen(port, '0.0.0.0', () => {
        console.log(`Server running on http://16.170.245.69:${port}`);
        console.log(`Employee Dashboard: http://16.170.245.69:${port}/`);
        console.log(`HR Dashboard: http://16.170.245.69:${port}/hr`);
    });
}).catch(err => {
    console.error('Failed to start server:', err.message);
    process.exit(1);
});