# Environment Variable Documentation

To run the serverless backend, create a `.env` file in the root directory (or configure these environment variables in your Vercel Project Settings).

---

## 🔑 Required Configuration Settings

| Variable Name | Description | Example / Default Value |
| :--- | :--- | :--- |
| **`DATABASE_URL`** | MongoDB Atlas connection string (used by Prisma). Must contain the database name. For high scale (100k RPS), append `?maxPoolSize=5&minPoolSize=1` to limit serverless container database connection hooks. | `mongodb+srv://user:pass@cluster.mongodb.net/aapadbandhav?retryWrites=true&w=majority&maxPoolSize=5&minPoolSize=1` |
| **`JWT_SECRET`** | Secret key used to sign and verify JWT authentication tokens. | `super_secure_random_64_character_string_here` |
| **`NODE_ENV`** | Current Node execution environment (`development`, `production`, or `test`). | `production` |

---

## 📡 Pusher Realtime Configuration

These variables are required for the stateless realtime broadcast layer. Get them from your Pusher Channels dashboard.

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| **`PUSHER_APP_ID`** | Pusher Application ID. | `1234567` |
| **`PUSHER_KEY`** | Pusher public API key. | `a1b2c3d4e5f6g7h8i9j0` |
| **`PUSHER_SECRET`** | Pusher private secret key. | `j0i9h8g7f6e5d4c3b2a1` |
| **`PUSHER_CLUSTER`** | Pusher cluster zone. | `ap2` (or `mt1`) |

*Note: On the React frontend, you should also define `VITE_PUSHER_KEY` and `VITE_PUSHER_CLUSTER` in `frontend/.env` (or pass them in through Vercel build environment) to allow the socket client emulator to connect.*

---

## 🗄️ Supabase Storage Configuration

Required to upload and host evidence attachments (accident photos/videos) in the cloud.

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| **`SUPABASE_URL`** | The API endpoint URL of your Supabase project. | `https://your-project-id.supabase.co` |
| **`SUPABASE_SERVICE_ROLE_KEY`** | The secret service-role API key (bypasses Row-Level Security to write evidence). | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` |
| **`SUPABASE_BUCKET_NAME`** | The name of the storage bucket created to host evidence files. | `evidence` |

---

## 💬 SMS Gateway Settings

Required to dispatch Phase 1 emergency alerts to citizen emergency contacts.

| Variable Name | Description | Example Value |
| :--- | :--- | :--- |
| **`SMS_GATEWAY_URL`** | The HTTP GET query string endpoint of your SMS gateway. | `https://sms.nighatech.com/api/send` |
| **`SMS_API_KEY`** | Secret key or auth token used to authenticate with the SMS gateway. | `your_sms_gateway_api_key` |
| **`SMS_SENDER_ID`** | Approved header alphanumeric code matching your registered SMS template. | `NGHATE` |

---

## 🛡️ Administrative Accounts

Configure the default system credentials.

| Variable Name | Description | Example / Default Value |
| :--- | :--- | :--- |
| **`ADMIN_EMAIL`** | Default email used for Control Room admin portal login. | `admin@aapadbandhav.in` |
| **`ADMIN_PASSWORD`** | Default password used for Control Room admin portal login. | `Admin@2024` |
| **`ADMIN_MOBILE`** | Aligns with the default admin user's mobile number. | `9999999999` |
