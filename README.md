# IT Help Desk & Asset Management System

A full-stack application built to support IT help desk workflows and IT asset management using modern web technologies.

## Overview

This project combines a React and TypeScript frontend with a FastAPI backend and a MySQL database. SQLAlchemy is used for database connectivity and ORM operations.

The project demonstrates full-stack development, REST API integration, relational database management, and environment-based configuration.

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Database | MySQL |
| ORM | SQLAlchemy |
| Database Driver | PyMySQL |
| Configuration | python-dotenv |

## Project Structure

```text
IT Help Desk & Asset Management System/
├── frontend/          # React + TypeScript application
├── .env.example       # Example environment configuration
├── .gitignore
├── database.py        # Database connection and session setup
├── main.py            # FastAPI application
└── test_db.py         # Database connection test
```

## Getting Started

### Prerequisites

- Python
- Node.js and npm
- MySQL Server

### 1. Clone the repository

```bash
git clone https://github.com/reborn742/it-help-desk-asset-management.git
cd it-help-desk-asset-management
```

### 2. Configure the database

Create a MySQL database named `helpdesk_db` if it does not already exist.

Copy `.env.example` to `.env` and update the values with your local MySQL configuration:

```env
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_HOST=localhost
DB_PORT=3306
DB_NAME=helpdesk_db
```

**Security:** Never commit your `.env` file or expose database credentials publicly.

> Database schema and initial data setup may require additional project-specific steps.

### 3. Start the backend

Create and activate a Python virtual environment, then install the project's required Python packages.

Run the FastAPI application using the entry point configured in `main.py`.

Once running, the API documentation is available at:

http://127.0.0.1:8000/docs

### 4. Start the frontend

Open a separate terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite, typically:

http://127.0.0.1:5173

## Database Connection Test

The repository includes `test_db.py` for checking database connectivity.

Run it from the project root using your configured Python environment:

```bash
python test_db.py
```

## Current Development

This project is being developed as a practical full-stack IT operations application. Its implementation and documentation will evolve as additional functionality is completed and verified.

## Author

Faisal Rahman

GitHub: [@reborn742](https://github.com/reborn742)

---

