# CliniSYS GP – Clinic Management System (Demo)

A modern, browser-based demo inspired by **CliniSYS GP** (Chapters 1–3 of the official User’s Guide).

Built with **HTML + CSS + Vanilla JavaScript**. No build step required. Data is stored in the browser’s **LocalStorage**.

---

## Features

### Chapter 1 – Get to Start
- Login screen (default: `admin` / `admin`)

### Chapter 2 – Operation
- **Patient Registration** – Cash / Panel, search, edit, register to queue
- **Queue** – status flow: `REG` → `FCON` → `FDIS` → `DONE`
- **Consultation** – notes, summary, drug search (`para` or `%tab`), editable qty, **Quick Regime** one-click sets, visit history
- **Dispensary** – review items, print labels, complete (auto stock deduct)
- **Payment Collection** – summary + receive payment
- **Medical Certificate** – generate & print MC

### Chapter 3 – Inventory
- **Stock Master** – CRUD, balance, reorder alert (highlighted)
- **Supplier Master** – CRUD
- **Regime Group** – pre-defined drug sets
- **Purchase Order** – create PO
- **Goods Receive** – receive stock & update balance

---

## How to Run in VS Code

### Option A – Live Server (recommended)
1. Extract the ZIP and open the `clinisys-gp` folder in VS Code.
2. Install the **Live Server** extension (Ritwick Dey).
3. Right-click `index.html` → **Open with Live Server**.

### Option B – Terminal
```bash
cd clinisys-gp
npx --yes serve .
```
Open the URL shown (e.g. http://localhost:3000).

**Or Python:**
```bash
cd clinisys-gp
python -m http.server 5500
```
Open http://localhost:5500

---

## Default Login

| Field    | Value  |
|----------|--------|
| User ID  | admin  |
| Password | admin  |

---

## Suggested Demo Flow
1. Login → `admin` / `admin`
2. **Patient Registration** → New Patient (or use samples) → **Register to Queue**
3. **Queue** → **Consult**
4. Write notes, search drugs or use **Quick Regime** → **Complete Consultation**
5. Dispensary opens automatically for that patient → **Dispensary Completed**
6. Payment opens automatically → **Receive Payment**
7. Explore Stock / Goods Receive / Regime as needed

Use **Reset Demo Data** on the Dashboard anytime for a clean start.

---

## Reliability & Safety
- XSS-hardened (user text is escaped before display)
- Confirmations on complete consultation, payment, logout, reset
- Safe number clamping (no negative qty/prices)
- Auto-select next step patient after complete
- Low-stock highlighting
- Frontend demo only — not for real clinical use

---

© Demo inspired by MedexOne Global CliniSYS GP User’s Guide  
For educational use only.
