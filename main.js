//const { app, BrowserWindow, ipcMain } = require('electron');
const electron = require('electron');
const path = require('path');
const db = require('./database-async');
//const { initDatabase } = require('./database.js'); // Import the database functions

function createWindow() {
  const mainWindow = new electron.BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      // Point to the preload script
      preload: path.join(__dirname, 'preload.js'), 
      nodeIntegration: false, // Security: Keep Node.js disabled in the Renderer
      contextIsolation: true, // Security: Use the preload script to bridge
    }
  });

  mainWindow.loadFile('index.html');
}

/**
 * Sets up the simplified IPC handler to route ONLY READ queries 
 * to the database functions.
 */
function setupIpcHandlers() {
  // Listen only for the 'main-process-query' channel
  electron.ipcMain.handle('main-process-query', async (event, args) => {
    const { queryName, params } = args;

    try {
      // Use a switch statement to route the request based on the queryName string
      switch (queryName) {
        case 'getAllTransactions':
          return await db.getAllTransactions();
          
        case 'getAllCategoryNames':
          // This is still useful for filtering in the UI
          return await db.getAllCategoryNames(); 
          
        case 'getMonthlyCashFlow':
          return await db.getMonthlyCashFlow(); 

        case 'getTransactionsByMonthAndType':
            // Params should be passed as an object { month, type }
            return await db.getTransactionsByMonthAndType(params.month, params.type);
        
        case 'getCategoryBreakdown':
            return await db.getCategoryBreakdown(params.month, params.type);

        case 'getCategoryBreakdownAllTime':
            return await db.getCategoryBreakdownAllTime();
            
        case 'getAllTransactionsDetailed':
            return await db.getAllTransactionsDetailed();
            
        default:
          throw new Error(`Unknown query name: ${queryName}`);
      }
    } catch (error) {
      console.error(`Error handling ${queryName}:`, error.message);
      return { error: error.message }; // Return error to the renderer
    }
  });
}

electron.app.on('ready', async () => { // <-- NOTE: app.on('ready') callback is now async
  try {
    await db.initDatabase(); // <-- AWAIT the asynchronous initialization
    setupIpcHandlers();
    createWindow();
  } catch (e) {
    console.error("Fatal Error during Database Init:", e);
    app.quit(); // Exit if we can't connect to the DB
  }
});

electron.ipcMain.handle('get-all-tx', async (event, args) => {
  // Call your database function here
  return db.getAllTransactions();
});