# AirInvoice

Mobile-first airport cargo invoice tracker with Supabase storage, PDF invoice download, WhatsApp invoice sharing, and paid/unpaid sorting.

## Local Setup

Create a private `.env` or `supabase.txt` file with:

```env
APP_USERNAME=your-login
APP_PASSWORD=your-password
SUPABASE_URL=https://pxqfjskcwodcpxiserbr.supabase.co
SUPABASE_SECRET_KEY=your-server-only-secret-key
SUPABASE_TABLE=invoice_items
```

Run the app:

```bash
npm start
```

Open:

```text
http://localhost:3000
```

## Supabase Setup

Run `supabase-setup.sql` in the Supabase SQL Editor before using the app in production.

## Deploy

Use Render as a Node Web Service. The included `render.yaml` defines the build/start commands and required environment variables.
