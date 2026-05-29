# AirInvoice Deployment Checklist

## 1. Create the Supabase table

Open Supabase Dashboard, go to SQL Editor, and run `supabase-setup.sql`.

## 2. Add private config

Do not put real keys in GitHub or in frontend code.

Create environment variables on your hosting provider:

```env
APP_USERNAME=your-client-login
APP_PASSWORD=your-client-password
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your_server_only_key
SUPABASE_TABLE=invoice_items
```

For local testing, you can put the same values in `.env` or `supabase.txt`.

## 3. Deploy the Node app

Recommended simple option: Render Web Service.

Settings:

```text
Build Command: npm install
Start Command: npm start
```

Then add the same environment variables in Render.

## 4. Test before giving to the client

Check:

- Login works with the client username/password.
- Add invoice works.
- Paid/unpaid status changes save.
- Download PDF works on phone and desktop.
- WhatsApp message opens correctly.
- Refreshing the page keeps saved invoice data.

## 5. Domain

Free option: use the hosting provider subdomain, like `your-app.onrender.com`.

Client-ready option: buy a domain and connect it to the hosting provider with HTTPS enabled.
