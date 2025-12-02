// database-sync.js (Used by import-cli.js)

const Database = require('better-sqlite3');
const path = require('path');
const model = require('./data-model.js');

const dbPath = path.join(__dirname, 'finance.db');
let db;

// NOTE: We assume the CLI script initializes the database 
// tables using a shared utility or by running the async setup once.

// --- INITIALIZATION AND SETUP (SYNC) ---

function initDatabaseSync() {
    try {
        // Open the database synchronously
        db = new Database(dbPath); 
        db.exec('PRAGMA journal_mode = WAL;'); // Performance boost
        console.log('Sync SQLite database connection established.');

        // Re-run the table creation/category insert to ensure the schema exists
        // This relies on the same code as database-async, but executed synchronously
        createTablesSync();
        insertInitialCategoriesSync();
        
        return true;
    } catch (error) {
        console.error('Failed to initialize database synchronously:', error.message);
        throw error;
    }
}

function createTablesSync() {
    // Use the imported SCHEMA_SQL commands
    db.exec(model.SCHEMA_SQL.ACCOUNTS);
    db.exec(model.SCHEMA_SQL.CATEGORIES);
    db.exec(model.SCHEMA_SQL.PARTY);
    db.exec(model.SCHEMA_SQL.TRANSACTIONS);
}

function insertInitialCategoriesSync() {
    const insertStmt = db.prepare('INSERT OR IGNORE INTO categories (name, type) VALUES (?, ?)');
    const insertMany = db.transaction((cats) => {
        // Use the imported CATEGORY_LIST
        for (const cat of model.CATEGORY_LIST) {
            insertStmt.run(cat.name, cat.type);
        }
    });
    insertMany(model.CATEGORY_LIST); // Pass the list to the transaction
}

// --- DATA MANIPULATION (WRITE) FUNCTIONS (SYNC) ---
/**
 * Checks if an account exists by name. If not, creates it.
 * Returns the Account ID.
 */
function getOrCreateAccount(name, type, initialBalance) {
    // 1. Check if account exists
    const stmt = db.prepare('SELECT id FROM accounts WHERE name = ?');
    const row = stmt.get(name);

    if (row) {
        return row.id;
    }

    // 2. Create if missing
    console.log(`Account '${name}' not found. Creating it...`);
    const insertStmt = db.prepare('INSERT INTO accounts (name, type, initial_balance) VALUES (?, ?, ?)');
    const info = insertStmt.run(name, type, initialBalance || 0);
    
    return info.lastInsertRowid;
}

function getOrCreatePartyId(partyName) {
    const UNCATEGORIZED_ID = 18; // Must match the ID from insertInitialCategoriesSync
    
    let partyStmt = db.prepare('SELECT id FROM party WHERE name = ?');
    let party = partyStmt.get(partyName);

    if (party) {
        return party.id;
    }

    let insertStmt = db.prepare('INSERT INTO party (name, default_category_id) VALUES (?, ?)');
    let info = insertStmt.run(partyName, UNCATEGORIZED_ID);
    
    return info.lastInsertRowid;
}


function insertBatchTransactions(transactions) {
    const insertStmt = db.prepare(`
        INSERT INTO transactions (date, description, amount, account_id, category_id, party_id)
        VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((txs) => {
        let insertedCount = 0;
        for (const tx of txs) {
            const partyId = getOrCreatePartyId(tx.party_name); 
            
            // Get the default category ID from the Party table
            const categoryIdResult = db.prepare('SELECT default_category_id FROM party WHERE id = ?').get(partyId);
            const defaultCategoryId = categoryIdResult ? categoryIdResult.default_category_id : 18;

            insertStmt.run(
                tx.date, 
                tx.description, 
                tx.amount, 
                tx.account_id, 
                tx.category_id || defaultCategoryId, 
                partyId 
            );
            insertedCount++;
        }
        return insertedCount; 
    });

    return insertMany(transactions);
}

// Read function for the CLI to get the initial map once
function getAllInternalCategoryMapSync() {
    const categories = db.prepare('SELECT id, name FROM categories').all();
    const map = {};
    categories.forEach(cat => {
        map[cat.name] = cat.id;
    });
    return map;
}

module.exports = {
    initDatabaseSync,
    getOrCreateAccount,
    getOrCreatePartyId,
    insertBatchTransactions,
    getAllInternalCategoryMapSync,
};