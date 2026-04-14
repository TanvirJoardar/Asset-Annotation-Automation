import time
import pandas as pd
from selenium import webdriver
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager
from selenium.webdriver.common.keys import Keys

# --- CONFIGURATION (UPDATE THESE SELECTORS) ---
EXCEL_FILE = "ids.xlsx"
COLUMN_NAME = "ID"
LOGIN_URL = "https://dev.slp.sji3.net/dashboard/MjA3OTg3/floorplan/outdoor-linkway%2C%20dop?update=true"

# Please update these CSS Selectors!
# Right-click the Search Textbox on your web page -> Inspect. Find a unique ID or Class.
SEARCH_BAR_SELECTOR = "input.search-field"
SEARCH_BUTTON_SELECTOR = ".fa-magnifying-glass"
# This is the first item that appears in the dropdown after searching.
RESULT_ITEM_SELECTOR = ".search-item" 

# CSS Selector for the floorplan canvas
CANVAS_SELECTOR = "div.konvajs-content canvas"
# Where the asset appears by default after selection
Adjust_X = 6 # half of Circle height/width
Adjust_Y = 6 # half of Circle height/width
# ---------------------------------------------

def automate_asset_placement():
    # 1. Read IDs from Excel
    print(f"Reading IDs from {EXCEL_FILE}...")
    try:
        df = pd.read_excel(EXCEL_FILE)
        # Ensure it reads the column regardless of capitalization just in case, but rely on 'ID'
        if COLUMN_NAME not in df.columns:
            print(f"Could not find column '{COLUMN_NAME}'. Available columns: {df.columns.tolist()}")
            return
        
        # Convert IDs to strings and cast X, Y to floats
        ids_data = []
        for _, row in df.iterrows():
            if pd.notna(row[COLUMN_NAME]):
                ids_data.append({
                    'id': str(row[COLUMN_NAME]),
                    'x': float(row['X']) if 'X' in df.columns and pd.notna(row['X']) else 0,
                    'y': float(row['Y']) if 'Y' in df.columns and pd.notna(row['Y']) else 0
                })
        
        print(f"Loaded {len(ids_data)} IDs with coordinates.")
    except Exception as e:
        print(f"Error reading Excel file: {e}")
        return

    # 2. Setup WebDriver
    print("Connecting to your existing Chrome browser...")
    service = Service(ChromeDriverManager().install())
    
    options = webdriver.ChromeOptions()
    # Connect to the Chrome instance launched with --remote-debugging-port=9222
    options.add_experimental_option("debuggerAddress", "127.0.0.1:9222")
    
    try:
        driver = webdriver.Chrome(service=service, options=options)
    except Exception as e:
        print("\n❌ Could not connect to Chrome.")
        print("Did you start Chrome with the '--remote-debugging-port=9222' flag? Check the instructions!")
        return

    # 3. Open Website and check readiness
    print(f"\nNavigating to: {LOGIN_URL}")
    driver.get(LOGIN_URL)
    
    print("\n--------------------------------------------------------------")
    print("Please make sure you are properly logged in and can see the SEARCH BAR.")
    print("--------------------------------------------------------------\n")
    input("👉 Press ENTER here in this console to continue automation: ")

    # 4. Automation Loop
    print("\nStarting automation...")
    for item in ids_data:
        item_id = item['id']
        target_x = item['x'] + Adjust_X
        target_y = item['y'] + Adjust_Y
        
        try:
            print(f"Processing ID: {item_id} -> Move to ({target_x}, {target_y})")
            
            # Wait for search bar to be clickable (up to 10 seconds)
            wait = WebDriverWait(driver, 10)
            
            # Find search bar, clear it, and enter the ID
            search_input = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, SEARCH_BAR_SELECTOR)))
            
            # If standard clear doesn't work well due to JS frameworks, Control+A and Backspace is safer
            search_input.send_keys(Keys.CONTROL + "a")
            search_input.send_keys(Keys.BACKSPACE)
            time.sleep(0.5) 
            
            search_input.send_keys(item_id)
            time.sleep(1) # Wait a moment for UI state (e.g. React/Vue) to catch up
            
            # Find search button and click it
            search_button = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, SEARCH_BUTTON_SELECTOR)))
            search_button.click()
            
            # --- Select the 1st item/child ---
            print(f"  Waiting for search result for {item_id}...")
            try:
                # Wait for the result to appear
                first_result = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, RESULT_ITEM_SELECTOR)))
                first_result.click()
                print(f"  ✓ Selected 1st result for: {item_id}")
                
                # --- NEW: Precise Positioning using Konva.js JavaScript ---
                time.sleep(1.5) # Wait for asset to be added to the Konva stage
                print(f"  Positioning asset to ({target_x - Adjust_X}, {target_y - Adjust_Y}) via Konva.js...")
                
                # We use JavaScript because dragging on a canvas via standard Selenium mouse moves
                # is often blocked or inaccurate in complex Konva/React apps.
                # This script finds the last added shape (the one we just searched) and moves it.
                move_script = """
                const stage = Konva.stages[0];
                if (!stage) { return "Stage not found"; }
                
                // Find all potential asset nodes (Images and Circles)
                const nodes = stage.find('Image, Circle');
                if (nodes.length === 0) { return "No nodes found on canvas"; }
                
                // The newly added asset is typically the last one in the Konva tree
                const targetNode = nodes[nodes.length - 1];
                
                // Update position
                targetNode.position({ x: arguments[0], y: arguments[1] });
                
                // Fire dragend to trigger the application's internal update logic (handleDragEnd)
                targetNode.fire('dragend', { target: targetNode }, true);
                
                // Redraw to reflect changes visually
                stage.batchDraw();
                
                return "Successfully moved node: " + (targetNode.attrs.id || "Unknown ID");
                """
                
                js_result = driver.execute_script(move_script, target_x, target_y)
                print(f"  Konva JS: {js_result}")
                
                # Optional: Click the 'Update' button if it exists and is required after moving
                try:
                    update_btn = driver.find_element(By.XPATH, "//button[contains(text(), 'Update')]")
                    # update_btn.click() # Uncomment if you want to auto-save after every move
                except:
                    pass
                
                print(f"  ✓ Positioning completed for: {item_id}")
                
            except Exception as result_error:
                print(f"  ⚠️ Could not select or drag result for {item_id}: {result_error}")
            # -------------------------------------------
            
            print(f"  ✓ Successfully completed automation for: {item_id}")
            time.sleep(2) # Brief pause before next item
            
        except Exception as e:
            print(f"  ❌ Error processing ID {item_id}: {type(e).__name__}")
            print(f"  Please check your CSS selectors or internet speed. Continuing to next ID...\n")

    print("\nAutomation completed!")
    input("Press Enter to close the browser and exit script...")
    driver.quit()

if __name__ == "__main__":
    automate_asset_placement()
