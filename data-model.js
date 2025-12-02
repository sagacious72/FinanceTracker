// data-model.js (Shared Schema Definitions)

// --- A. CATEGORIES LIST ---
const CATEGORY_LIST = [
    { name: 'Paycheck', type: 'INCOME' },
    { name: 'Other Income', type: 'INCOME' },
    { name: 'Utilities', type: 'EXPENSE' },
    { name: 'Groceries', type: 'EXPENSE' },
    { name: 'Dining', type: 'EXPENSE' },
    { name: 'Travel', type: 'EXPENSE' },
    { name: 'Fuel', type: 'EXPENSE' },
    { name: 'Health', type: 'EXPENSE' },
    { name: 'Entertainment', type: 'EXPENSE' },
    { name: 'Hobbies', type: 'EXPENSE' },
    { name: 'Shopping', type: 'EXPENSE' },
    { name: 'Home Supplies', type: 'EXPENSE' },
    { name: 'Child Health and Education', type: 'EXPENSE' },
    { name: 'Shared Expenses', type: 'EXPENSE' },
    { name: 'Taxes', type: 'EXPENSE' },
    { name: 'Insurance', type: 'EXPENSE' },
    { name: 'Transfers', type: 'TRANSFER' },
    { name: 'Uncategorized', type: 'EXPENSE' } 
];

// --- B. SCHEMA SQL COMMANDS ---
const SCHEMA_SQL = {
    // Note: No IF NOT EXISTS check here; that will be added by the caller's .exec() command.
    ACCOUNTS: `
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL, 
        initial_balance REAL NOT NULL,
        is_active INTEGER DEFAULT 1
      );`,
    CATEGORIES: `
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        parent_id INTEGER,
        type TEXT NOT NULL,
        FOREIGN KEY (parent_id) REFERENCES categories(id)
      );`,
    PARTY: `
      CREATE TABLE IF NOT EXISTS party (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        is_person INTEGER DEFAULT 0,
        default_category_id INTEGER,
        FOREIGN KEY (default_category_id) REFERENCES categories(id)
      );`,
    TRANSACTIONS: `
      CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        account_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        party_id INTEGER,
        is_cleared INTEGER DEFAULT 0,
        related_transaction_id INTEGER,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (party_id) REFERENCES party(id)
      );`
};

// --- C. CORE QUERY STRINGS ---
const QUERY_SQL = {
    // For getAllTransactions
    ALL_TRANSACTIONS: `
        SELECT 
            t.id, t.date, t.amount, t.description,
            a.name AS account_name,
            c.name AS category_name,
            p.name AS party_name
        FROM transactions t
        JOIN accounts a ON t.account_id = a.id
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN party p ON t.party_id = p.id
        ORDER BY t.date DESC;
    `,
    // For the Monthly Cash Flow Chart (to be drafted next!)
MONTHLY_CASH_FLOW: `
        SELECT 
            strftime('%Y-%m', t.date) as month,
            SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as total_income,
            SUM(CASE WHEN t.amount < 0 THEN t.amount ELSE 0 END) as total_expense,
            SUM(t.amount) as net_change
        FROM transactions t
        JOIN categories c ON t.category_id = c.id  -- Join required to check type
        WHERE c.type != 'TRANSFER'                 -- Filter out transfers
        GROUP BY month
        ORDER BY month ASC;
    `,
TRANSACTIONS_BY_MONTH_AND_TYPE: `
        SELECT 
            t.date, 
            t.amount, 
            t.description, 
            c.name as category_name,
            c.type as category_type,  -- Added to help identify transfers in UI
            p.name as party_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN party p ON t.party_id = p.id
        WHERE strftime('%Y-%m', t.date) = $month
        -- Filter removed: Transfers are now INCLUDED here
        AND (
            ($type = 'INCOME' AND t.amount > 0)
            OR 
            ($type = 'EXPENSE' AND t.amount < 0)
        )
        ORDER BY t.date DESC;
    `,
CATEGORY_BREAKDOWN_BY_MONTH_AND_TYPE: `
        SELECT 
            c.name,
            ABS(SUM(t.amount)) as total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE strftime('%Y-%m', t.date) = $month
        AND c.type != 'TRANSFER'  -- <--- NEW FILTER
        AND (
            ($type = 'INCOME' AND t.amount > 0)
            OR 
            ($type = 'EXPENSE' AND t.amount < 0)
        )
        GROUP BY c.name
        ORDER BY total DESC;
    `,
CATEGORY_BREAKDOWN_ALL_TIME: `
        SELECT 
            c.name,
            ABS(SUM(t.amount)) as total
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        WHERE c.type != 'TRANSFER'  -- Exclude Transfers
        AND t.amount < 0            -- Default to Expenses for clarity
        GROUP BY c.name
        ORDER BY total DESC;
    `,

    // NEW: Table List (All Time, Everything)
    ALL_TRANSACTIONS_DETAILED: `
        SELECT 
            t.date, 
            t.amount, 
            t.description, 
            c.name as category_name,
            c.type as category_type,
            p.name as party_name
        FROM transactions t
        JOIN categories c ON t.category_id = c.id
        LEFT JOIN party p ON t.party_id = p.id
        ORDER BY t.date DESC;
    `
};

module.exports = {
    CATEGORY_LIST,
    SCHEMA_SQL,
    QUERY_SQL
};