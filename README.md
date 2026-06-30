# Asset Annotation Automation

A web application for automating asset annotation on Konva.js-powered floorplan dashboards. The tool connects to a running Chrome instance, reads asset IDs and coordinates from an Excel file, then programmatically searches and positions each asset on the canvas.

## Tech Stack

- **Frontend:** React 18 + Vite + React Router
- **Backend:** Flask (Python) — API server + Selenium automation
- **Styling:** Custom CSS (dark dashboard theme)

## Features

- **Batch Annotation** — Upload an Excel file with asset IDs and X/Y coordinates, then automatically search and place each asset on the floorplan.
- **Asset Extraction** — Extract all placed assets and their positions from the Konva.js canvas into an Excel file.
- **Live Log Streaming** — Real-time progress updates via Server-Sent Events (SSE).
- **Chrome Debugging** — Connects to an existing Chrome session via remote debugging, so you stay logged in.

## Prerequisites

- **Python 3.9+**
- **Node.js 18+** (for frontend dev/build)
- **Google Chrome** (latest stable)
- **ChromeDriver** — automatically managed by `webdriver-manager`

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/Asset-Annotation-Automation.git
   cd Asset-Annotation-Automation
   ```

2. Set up the Python backend:

   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS / Linux
   source venv/bin/activate

   pip install flask pandas openpyxl selenium webdriver-manager
   ```

3. Set up the React frontend:

   ```bash
   cd frontend
   npm install
   cd ..
   ```

## Running the Application

### Step 1 — Launch Chrome with Remote Debugging

Close all Chrome windows first, then start Chrome with the debugging flag:

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

**Windows (PowerShell) — Kill existing Chrome and launch fresh instance:**

```powershell
taskkill /IM chrome.exe /F
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222","--user-data-dir=C:\temp\chrome-debug"
```

> **Important:** You must be logged into the target dashboard in this Chrome instance before running automation.

### Step 2 — Start Development Servers

**Option A — Using the batch file (Windows):**

```bash
start-dev.bat
```

This starts both Flask (port 5000) and Vite dev server (port 3000).

**Option B — Manual:**

In one terminal (Flask API):

```bash
venv\Scripts\activate
python app.py
```

In another terminal (Vite frontend):

```bash
cd frontend
npm run dev
```

### Step 3 — Use the Application

1. Open **http://localhost:3000** in your browser.
2. Configure the settings (login URL, selectors, debugger address, etc.).
3. Upload an Excel file (`.xlsx`, `.xls`, or `.csv`) containing asset IDs and optional X/Y coordinates.
4. Click **Verify Page** to confirm Chrome connection and page readiness.
5. Click **Start** to begin the annotation automation.
6. Monitor progress in the live log panel.

## Production Build

To build the frontend and serve everything from Flask:

```bash
cd frontend
npm run build
cd ..
python app.py
```

Then open **http://127.0.0.1:5000/app**.

Or use the batch file: `build.bat`

## Excel File Format

Your spreadsheet should contain at minimum a column with asset IDs. Optionally include `X` and `Y` columns for target coordinates.

| ID       | X      | Y      |
|----------|--------|--------|
| ASSET-01 | 450.0  | 320.0  |
| ASSET-02 | 610.0  | 180.0  |

- The ID column name is configurable (default: `ID`).
- If X/Y columns are absent or values are missing, coordinates default to `0, 0`.

## Extracting Assets

1. Navigate to the **Extract** page.
2. Enter the dashboard URL and click **Connect & Navigate**.
3. Confirm the page loaded, then click **Extract All Assets**.
4. The tool reads all Konva.js nodes from the canvas and returns their positions.
5. Download the results as Excel or CSV.

## Project Structure

```
Asset-Annotation-Automation/
├── app.py                  # Flask API server + Selenium automation
├── automate_assets.py      # Standalone CLI script
├── start-dev.bat           # Start both dev servers (Windows)
├── build.bat               # Build frontend for production
├── frontend/               # React + Vite frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   └── src/
│       ├── main.jsx        # React entry point
│       ├── App.jsx         # Router + layout
│       ├── index.css       # All styles
│       ├── api.js          # API client
│       ├── hooks/          # Custom React hooks
│       ├── components/     # Shared components
│       └── pages/          # Annotate & Extract pages
├── static/                 # Legacy static files (pre-Vite)
├── templates/              # Legacy Flask templates (pre-Vite)
├── uploads/                # Uploaded Excel files
└── ids.xlsx                # Sample asset data
```

## API Endpoints

| Method | Endpoint                  | Description                         |
|--------|---------------------------|-------------------------------------|
| GET    | `/api/config`             | Get current configuration           |
| POST   | `/api/config`             | Update configuration                |
| POST   | `/api/upload`             | Upload an Excel file                |
| POST   | `/api/verify`             | Connect to Chrome and verify page   |
| POST   | `/api/start`              | Start batch annotation              |
| POST   | `/api/stop`               | Stop running automation             |
| GET    | `/api/status`             | Check automation and driver status  |
| GET    | `/api/stream`             | SSE log stream                      |
| POST   | `/api/extract-assets`     | Extract assets from Konva canvas    |
| POST   | `/api/download-extracted` | Download extracted assets as Excel  |

## Configuration

Default settings are defined in `current_config` within `app.py`:

| Key                       | Default Value                                                                 | Description                              |
|---------------------------|-------------------------------------------------------------------------------|------------------------------------------|
| `excel_file`              | `ids.xlsx`                                                                    | Name of the uploaded Excel file          |
| `column_name`             | `ID`                                                                          | Column containing asset IDs              |
| `login_url`               | *(floorplan URL)*                                                             | Target dashboard URL                     |
| `search_bar_selector`     | `input.search-field`                                                          | CSS selector for the search input        |
| `search_button_selector`  | `.fa-magnifying-glass`                                                        | CSS selector for the search button       |
| `result_item_selector`    | `.search-item`                                                                | CSS selector for search result items     |
| `canvas_selector`         | `div.konvajs-content canvas`                                                  | CSS selector for the Konva canvas        |
| `adjust_x`                | `6`                                                                           | X-axis offset adjustment (pixels)        |
| `adjust_y`                | `6`                                                                           | Y-axis offset adjustment (pixels)        |
| `debugger_address`        | `127.0.0.1:9222`                                                              | Chrome remote debugging address          |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **"Could not connect to Chrome"** | Ensure Chrome is running with `--remote-debugging-port=9222` and no other Chrome profiles are using that port. |
| **"No active Chrome session"** | Click **Verify Page** before starting automation. |
| **"Search bar not found"** | Verify the `search_bar_selector` matches the actual element on the page. Use browser DevTools to inspect. |
| **"Konva.js not detected"** | Navigate to the floorplan page manually and ensure the canvas has fully loaded before extracting. |
| **Frontend not loading** | Run `npm install` in the `frontend/` directory, then `npm run dev`. |

## License

MIT
