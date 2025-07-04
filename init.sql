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