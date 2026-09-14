# J & D Institute of Nursing - Library Management Portal

A modern, offline-capable Library Management System built for J & D Institute of Nursing.
Supports hybrid cloud deployment on **Vercel** with **Neon Serverless PostgreSQL**, with automatic offline fallback to local **SQLite**.

---

## 🚀 Cloud Deployment Guide (GitHub + Neon + Vercel)

### Step 1: Create a Neon PostgreSQL Database
1. Go to [neon.tech](https://neon.tech) and sign in or create a free account.
2. Click **Create Project** (e.g. named `jd-library`).
3. Under **Connection Details**, select **Node.js** or copy the **Direct connection** / **Pooled connection** string:
   ```text
   postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require
   ```

---

### Step 2: Migrate Local Data to Neon PostgreSQL
Transfer all existing books (including imported Call Numbers), students, academic sessions, and transaction history to Neon:

1. Create a `.env` file in the root folder (or copy from `.env.example`):
   ```bash
   DATABASE_URL="postgresql://[user]:[password]@[endpoint].neon.tech/[dbname]?sslmode=require"
   ```
2. Run the automated migration script:
   ```bash
   npm run migrate:neon
   ```
3. The script will automatically:
   - Create all 5 required tables (`academic_years`, `students`, `books`, `transactions`, `journals`).
   - Transfer all records from your local `library.db` into Neon.
   - Synchronize all sequence counters for seamless auto-incrementing IDs.
   - Verify and print an audit summary table confirming 100% record match.

---

### Step 3: Push Code to GitHub
1. Create a new repository on GitHub (e.g., `jd-library-portal`).
2. Add your GitHub remote and push:
   ```bash
   git remote add origin https://github.com/[YOUR-USERNAME]/[YOUR-REPO-NAME].git
   git branch -M master
   git push -u origin master
   ```

---

### Step 4: Deploy on Vercel
1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **Add New...** -> **Project**.
3. Select and import your GitHub repository (`jd-library-portal`).
4. In the **Environment Variables** section, add:
   - **Key**: `DATABASE_URL`
   - **Value**: Your Neon connection string from Step 1.
5. Click **Deploy**.
6. Within seconds, your portal is live with full global access!

---

## 💻 Local Development (Offline Mode)

When running locally without a `DATABASE_URL` environment variable, the application automatically uses the local SQLite database (`library.db`):

```bash
npm start
```
Visit [http://localhost:3000](http://localhost:3000).

To run integration tests:
```bash
npm test
```
