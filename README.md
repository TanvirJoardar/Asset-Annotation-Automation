# Asset Annotation Automation

A Flask-based web application for automating asset annotation on Konva.js-powered floorplan dashboards. The tool connects to a running Chrome instance, reads asset IDs and coordinates from an Excel file, then programmatically searches and positions each asset on the canvas.

## Features

- **Batch Annotation** – Upload an Excel file with asset IDs and X/Y coordinates, then automatically search and place each asset on the floorplan.
- **Asset Extraction** – Extract all placed assets and their positions from the Konva.js canvas into an Excel file.
- **Live Log Streaming** – Real-time progress updates via Server-Sent Events (SSE).
- **Chrome Debugging** – Connects to an existing Chrome session via remote debugging, so you stay logged in.

## Prerequisites

- **Python 3.9+**
- **Google Chrome** (latest stable)
- **ChromeDriver** – automatically managed by `webdriver-manager`

## Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/yourusername/Asset-Annotation-Automation.git
   cd Asset-Annotation-Automation
   ```

2. Create and activate a virtual environment (recommended):

   ```bash
   python -m venv venv
   # Windows
   venv\Scripts\activate
   # macOS / Linux
   source venv/bin/activate
   ```

3. Install dependencies:

   ```bash
   pip install flask pandas openpyxl selenium webdriver-manager
   ```

4. Create the uploads directory (auto-created on run, but you can pre-create it):

   ```bash
   mkdir uploads
   ```

## Running the Application

### Step 1 – Launch Chrome with Remote Debugging

Close all Chrome windows first, then start Chrome with the debugging flag:

```bash
# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# macOS
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

**Windows (PowerShell) – Kill existing Chrome and launch fresh instance:**

```powershell
taskkill /IM chrome.exe /F
Start-Process "C:\Program Files\Google\Chrome\Application\chrome.exe" -ArgumentList "--remote-debugging-port=9222","--user-data-dir=C:\temp\chrome-debug"
```

> **Important:** You must be logged into the target dashboard in this Chrome instance before running automation.

### Step 2 – Start the Flask Server

```bash
python app.py
```

The server starts at **http://localhost:5000**.

### Step 3 – Use the Application

1. Open **http://localhost:5000** in your browser.
2. Configure the settings (login URL, selectors, debugger address, etc.).
3. Upload an Excel file (`.xlsx`, `.xls`, or `.csv`) containing asset IDs and optional X/Y coordinates.
4. Click **Verify Page** to confirm Chrome connection and page readiness.
5. Click **Start** to begin the annotation automation.
6. Monitor progress in the live log panel.

## Excel File Format

Your spreadsheet should contain at minimum a column with asset IDs. Optionally include `X` and `Y` columns for target coordinates.

| ID       | X      | Y      |
|----------|--------|--------|
| ASSET-01 | 450.0  | 320.0  |
| ASSET-02 | 610.0  | 180.0  |

- The ID column name is configurable (default: `ID`).
- If X/Y columns are absent or values are missing, coordinates default to `0, 0`.

## Extracting Assets

1. Navigate to **http://localhost:5000/extract**.
2. Enter the dashboard URL and click **Extract**.
3. The tool reads all Konva.js nodes from the canvas and returns their positions.
4. Download the results as an Excel file.

## API Endpoints

| Method | Endpoint                   | Description                          |
|--------|----------------------------|--------------------------------------|
| GET    | `/`                        | Main annotation page                 |
| GET    | `/api/config`              | Get current configuration            |
| POST   | `/api/config`              | Update configuration                 |
| POST   | `/api/upload`              | Upload an Excel file                 |
| POST   | `/api/verify`              | Connect to Chrome and verify page    |
| POST   | `/api/start`               | Start batch annotation               |
| POST   | `/api/stop`                | Stop running automation              |
| GET    | `/api/status`              | Check automation and driver status   |
| GET    | `/api/stream`              | SSE log stream                       |
| GET    | `/extract`                 | Asset extraction page                |
| POST   | `/api/extract-assets`      | Extract assets from Konva canvas     |
| POST   | `/api/download-extracted`  | Download extracted assets as Excel   |

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

## License

MIT
