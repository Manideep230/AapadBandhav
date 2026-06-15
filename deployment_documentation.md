# AapadBandhav Platform - Serverless Deployment Guide

This document describes how to deploy the migrated AapadBandhav platform to Vercel and set up the required cloud infrastructure (MongoDB Atlas, Pusher Channels, Supabase Storage, and Inngest).

---

## 🛠️ Prerequisites

Ensure you have accounts with the following providers:
1. [Vercel](https://vercel.com/) (for compute hosting)
2. [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (for database)
3. [Pusher Channels](https://pusher.com/channels) (for stateless realtime events)
4. [Supabase](https://supabase.com/) (for evidence file storage)
5. [Inngest Cloud](https://www.inngest.com/) (for durable serverless workflows)

---

## 🚀 1. Database Setup (MongoDB Atlas)

1. Create a free shared cluster in MongoDB Atlas.
2. In **Database Access**, create a database user with read/write privileges.
3. In **Network Access**, add `0.0.0.0/0` to allow access from Vercel's dynamic IP ranges.
4. Copy the connection string. It should look like:
   `mongodb+srv://<username>:<password>@cluster0.mongodb.net/aapadbandhav?retryWrites=true&w=majority`
5. Push the schema to your MongoDB Atlas database:
   ```bash
   npx prisma db push
   ```
6. Run the database seed script to load baseline mock responders:
   ```bash
   npx prisma db seed
   ```

---

## 📡 2. Realtime Event Setup (Pusher Channels)

1. Create a Channels app in the Pusher Console.
2. Copy your App ID, Key, Secret, and Cluster from the **App Keys** tab.
3. In your client-side React code, the socket emulator reads `VITE_PUSHER_KEY` and `VITE_PUSHER_CLUSTER` to establish listeners. Ensure these are defined in your frontend environment.

---

## 🗄️ 3. Cloud Storage Setup (Supabase)

1. Create a new project in Supabase.
2. Go to **Storage** and create a new public bucket named `evidence`.
3. Go to **Project Settings** -> **API** and copy your Project URL and `service_role` private key (needed to bypass RLS policies and store evidence buffers).

---

## ⚡ 4. Serverless Workflows (Inngest)

1. Sign up for Inngest and get your `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY`.
2. Vercel automatically deploys the serve endpoint at `/api/inngest`.
3. In the Inngest Cloud Dashboard, register your Vercel deployment URL (e.g. `https://your-app.vercel.app/api/inngest`) to connect your serverless workflow events.

---

## ☁️ 5. Vercel Deployment

You can deploy the platform to Vercel in one click using the Vercel CLI or via Github Integration.

### Option A: Using Git Integration (Recommended)
1. Push this codebase to a private GitHub repository.
2. Import the repository into your Vercel Dashboard.
3. Configure the **Build & Development Settings**:
   - **Framework Preset**: `Vite` (or Other)
   - **Build Command**: `npm run build`
   - **Output Directory**: `frontend/dist`
   - **Root Directory**: `./` (Root of workspace)
4. Add all required keys to the **Environment Variables** section (see [environment_variables.md](file:///e:/NighaTech/AapadBandhav/environment_variables.md)).
5. Click **Deploy**. Vercel will build the frontend React bundle, generate the Prisma client, and expose all TypeScript files in `api/` as serverless functions.

### Option B: Using Vercel CLI
```bash
# Install Vercel CLI
npm install -g vercel

# Log in and deploy
vercel login
vercel --prod
```
*Vercel will automatically read `vercel.json` routing configuration and map static files and API endpoints.*
