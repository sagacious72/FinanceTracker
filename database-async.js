// database-async.js (Used by Electron's main.js)

const sqlite = require('sqlite');
const sqlite3 = require('sqlite3');
const path = require('path');
const model = require('./data-model');

const dbPath = path.join(__dirname, 'finance.db');
let db;

// --- INITIALIZATION AND SETUP (ASYNC) ---

async function initDatabase() {
    try {
        db = await sqlite.open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        console.log('Async SQLite database connection established.');

        // Initialization functions must be awaited
        await createTables();
        await insertInitialCategories();

    } catch (error) {
        console.error('Failed to initialize database:', error.message);
        throw error;
    }
}

async function createTables() {
    // Use the imported SCHEMA_SQL commands
    await db.exec(model.SCHEMA_SQL.ACCOUNTS);
    await db.exec(model.SCHEMA_SQL.CATEGORIES);
    await db.exec(model.SCHEMA_SQL.PARTY);
    await db.exec(model.SCHEMA_SQL.TRANSACTIONS);
    console.log('Tables created or already exist.');
}

async function insertInitialCategories() {
    // Use the imported CATEGORY_LIST
    for (const cat of model.CATEGORY_LIST) {
        await db.run('INSERT OR IGNORE INTO categories (name, type) VALUES (?, ?)', [cat.name, cat.type]);
    }
    console.log('Initial categories inserted (or already exist).');
}

async function getAllTransactions() {
  // Use the imported QUERY_SQL string
  return db.all(model.QUERY_SQL.ALL_TRANSACTIONS); 
}

async function getAllInternalCategoryMap() {
    const categories = await db.all('SELECT id, name FROM categories');
    const map = {};
    categories.forEach(cat => {
        map[cat.name] = cat.id;
    });
    return map;
}

async function getMonthlyCashFlow() {
    return db.all(model.QUERY_SQL.MONTHLY_CASH_FLOW);
}

async function getTransactionsByMonthAndType(month, type) {
    return db.all(model.QUERY_SQL.TRANSACTIONS_BY_MONTH_AND_TYPE, {
        $month: month,
        $type: type
    });
}

async function getCategoryBreakdown(month, type) {
    return db.all(model.QUERY_SQL.CATEGORY_BREAKDOWN_BY_MONTH_AND_TYPE, {
        $month: month,
        $type: type
    });
}

async function getCategoryBreakdownAllTime() {
    return db.all(model.QUERY_SQL.CATEGORY_BREAKDOWN_ALL_TIME);
}

async function getAllTransactionsDetailed() {
    return db.all(model.QUERY_SQL.ALL_TRANSACTIONS_DETAILED);
}

module.exports = {
  initDatabase,
  getAllTransactions,
  getAllInternalCategoryMap,
  getMonthlyCashFlow,
  getTransactionsByMonthAndType,
  getCategoryBreakdown,
  getCategoryBreakdownAllTime,
  getAllTransactionsDetailed
};