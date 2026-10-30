# Farol Orders

QR ordering for restaurants. A customer scans the code on their table, orders food and drinks with notes, and the order pops up in the restaurant's hub. Staff accept or decline it, and the ticket (*comanda*) prints in the kitchen and at the bar.

| Page | Who uses it | What it does |
|---|---|---|
| `admin.html` | Farol (you) | Your own login. Create restaurant hubs, invite owners, switch hubs on/off, see activity |
| `hub.html` | Restaurant staff (their own login) | Live orders with sound alerts, accept/decline, kitchen & bar tickets, sold-out switch, pause ordering, menu editor with auto-translate, tables & QR sheet, printers, sales, opening hours, team |
| `order.html?t=…` | Customers (from the table QR) | Menu in Spanish/English, allergens, options, notes, live order status, call waiter / ask for the bill, Google review prompt |

The sales demo (phone and hub side by side, no backend) lives separately in the `farol-demos` repo under `pedidos/`. This site is the real thing: once `config.js` points at your Supabase project, every page runs live.

## Go live

### 1. GitHub
1. Create a **public** repository named `farol-orders` and put this folder in it.
2. **Settings → Pages → Deploy from a branch → main / (root) → Save.** The site appears at `https://YOUR-USER.github.io/farol-orders/`.
   Keep the `.nojekyll` file: without it GitHub hides the `supabase/functions/_shared` folder the hub needs.

### 2. Supabase (the database and logins)
1. Sign up at supabase.com → **New project**. Pick a European region (Paris or Frankfurt) and save the database password somewhere safe.
2. **SQL Editor → New query**: paste all of `supabase/setup.sql` → **Run**. It creates every table, the security rules, the sample menu and the Farol admin e-mail list. (The admin e-mail is at the very end of the file; change it first if you want a different one.)
3. **Authentication → URL Configuration**: set **Site URL** to `https://YOUR-USER.github.io/farol-orders/hub.html`, and add `https://YOUR-USER.github.io/farol-orders/hub.html` and `…/admin.html` under **Redirect URLs**. These are where the confirmation and password-reset e-mails send people.
4. **Project Settings → API**: copy the **Project URL** and the **anon public** key into `config.js`, and push. (The anon key is meant to be public; the security rules protect the data.)

### 3. Your Farol admin login
Open `…/admin.html` → **Create account** with the e-mail from the admin list → click the link in the confirmation e-mail → sign in. You're the Farol admin.

### 4. A restaurant (e.g. Casa Lola)
1. In **admin.html → New restaurant hub**: name, web address (`casa-lola`), the owner's e-mail, and tick the sample menu.
   To test it yourself first, use a Gmail "plus" address such as `you+casalola@gmail.com`: it's a separate login, but the e-mails still arrive in your inbox.
2. Open `…/hub.html` → **Create account** with that same e-mail → confirm → sign in. That login now opens Casa Lola's hub, and only Casa Lola's. Owners can add staff logins in **Settings → Team**.
3. In the hub: edit the **Menu** (*Translate missing English* fills in the English), then **Tables & QR → Print QR sheet** and put each code on its table. Scanning a code opens that table's menu at `order.html?t=…`.

### 5. Optional server functions
Only needed for **cloud printers** (Star / Epson) and for **DeepL** translations. Auto-translate works without them, using the free MyMemory service. You need Node.js. In this folder:

```
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF        # the ref is in the project URL: https://YOUR_PROJECT_REF.supabase.co
npx supabase functions deploy cloudprnt --no-verify-jwt
npx supabase functions deploy epson-print --no-verify-jwt
npx supabase functions deploy translate
npx supabase secrets set DEEPL_API_KEY=your-key:fx      # optional: free DeepL key, 500,000 characters/month
```

## Printing

Each accepted order makes one ticket per printer: food goes to printers set to *Kitchen*, drinks to *Bar*, everything to *Everything*. Which category is food or drink is set per category (*Prepared at*). Tickets carry no prices and say *Documento no válido como factura*, so they're kitchen orders, not receipts; billing stays on the restaurant's own till.

### Option 1 — the hub screen prints (cheap)
1. **Printers → Add printer → Printer on this computer or tablet.**
2. On the computer next to the receipt printer, open the hub → **Printers → This device**: tick that printer and choose **Print automatically**.
3. Make the receipt printer the computer's **default printer** (80 mm paper).
4. Start Chrome in kiosk-printing mode so tickets print without the *Print* window:
   - Windows: Chrome shortcut → Properties → add `--kiosk-printing` at the end of *Target*.
   - Mac: `open -a "Google Chrome" --args --kiosk-printing` (quit Chrome first).
5. Keep that hub tab open. If it was closed or offline, queued tickets print when it comes back.

New screens print nothing until set up, so the owner checking orders on their phone never "steals" kitchen tickets. If two screens are set up for the same printer, each ticket still prints once.

### Option 3 — cloud printer (no computer needed)
1. **Printers → Add printer → Star Micronics (CloudPRNT)** or **Epson (Server Direct Print)**.
2. Open **Set up the printer**, copy the address, and paste it into the printer's own settings page (the steps are listed there).
3. Press **Test**.

- **Star** (e.g. mC-Print3, TSP100IV): prints plain text, so accents are dropped (*Jamon*).
- **Epson** (e.g. TM-m30III, TM-T88VII): prints bold, large text and accents, and cuts the paper.

Both protocols were tested against simulated printers, not physical ones, so **try one real printer before buying several**. The printer address contains a secret key, so treat it like a password; delete and re-add the printer to change it.

## Costs and limits
- **GitHub Pages:** free.
- **Supabase Free:** fine for testing, but **a free project pauses after 7 days without activity**. Once restaurants depend on it, move to **Pro** (about $25/month per organization). All restaurants share one project, so that's one cost for all of them.

## Changing things
- **Sample menu:** edit `assets/js/core/sample-menu.js` and run `npm run build:seed` (rebuilds `supabase/setup.sql`). To apply it to an existing project, run just `supabase/migrations/0002_sample_menu.sql` in the SQL Editor. Existing restaurants aren't affected.
- **Texts:** `assets/js/order/strings.js` (customer) and `assets/js/hub/strings.js` (hub), in Spanish and English.
- **Look:** `assets/css/app.css`. Each restaurant's menu colour, logo and welcome text are set in its hub (**Settings**).

## Tests
```
npm install && npm test        # database rules, prices, options, hours, printing queue, security (in-memory Postgres)
npm run test:printers          # simulated Star and Epson printers (needs Deno)
```

## Folder map
```
index.html, admin.html, hub.html, order.html, config.js
assets/css/app.css
assets/js/order/      customer page
assets/js/hub/        restaurant hub (orders, menu, tables, printers, stats, settings)
assets/js/admin/      Farol admin
assets/js/api/        live backend (Supabase) and in-browser demo backend
assets/js/core/       shared helpers, sample menu
assets/js/vendor/     Preact + htm, Supabase client, QR code generator (no build step)
supabase/setup.sql    whole database in one file (built from supabase/migrations/)
supabase/functions/   cloudprnt (Star), epson-print (Epson), translate, _shared/ticket-format.js
tests/, tools/
```
