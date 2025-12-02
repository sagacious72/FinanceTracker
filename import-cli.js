const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const db = require('./database-sync'); 
const { parse, isValid, format } = require('date-fns');

// --- CONFIGURATION & GLOBALS ---

const MAPS_FILE_PATH = path.join(__dirname, 'maps.json');
let INSTITUTION_MAPS = {};

try {
    if (fs.existsSync(MAPS_FILE_PATH)) {
        const mapsData = fs.readFileSync(MAPS_FILE_PATH, 'utf-8');
        INSTITUTION_MAPS = JSON.parse(mapsData);
    } else {
        console.error(`Fatal Error: maps.json not found at ${MAPS_FILE_PATH}.`);
        process.exit(1);
    }
} catch (e) {
    console.error(`Fatal Error: Could not parse maps.json. Ensure it is valid JSON.`);
    process.exit(1);
}

// Global lookup for internal categories (Loaded once)
let INTERNAL_CATEGORY_IDS = {};      
let UNCATEGORIZED_ID = null;

// --- MAIN EXECUTION ---

async function runImport() {
    // 1. Parse Arguments into Pairs
    const args = process.argv.slice(2);
    
    if (args.length === 0 || args.length % 2 !== 0) {
        console.error("Usage: node import-cli.js <file_path_1> <key_1> [<file_path_2> <key_2> ...]");
        console.log(`Available Keys: ${Object.keys(INSTITUTION_MAPS).join(', ')}`);
        process.exit(1);
    }

    const importPairs = [];
    for (let i = 0; i < args.length; i += 2) {
        importPairs.push({
            filePath: args[i],
            mapKey: args[i+1]
        });
    }

    console.log(`\n🚀 Starting Batch Import for ${importPairs.length} file(s)...`);

    // 2. RESET DATABASE (NEW)
    // Delete the existing file so we start with a clean slate
    const dbPath = path.join(__dirname, 'finance.db');
    if (fs.existsSync(dbPath)) {
        try {
            fs.unlinkSync(dbPath);
            console.log("🗑️  Existing database deleted. Starting fresh.");
        } catch (e) {
            console.error("Fatal Error: Could not delete existing database.", e.message);
            process.exit(1);
        }
    }

    // 3. Initialize Database (ONCE)
    // This will automatically recreate the file and tables because the file is missing
    try {
        db.initDatabaseSync();
        INTERNAL_CATEGORY_IDS = db.getAllInternalCategoryMapSync();
        UNCATEGORIZED_ID = INTERNAL_CATEGORY_IDS['Uncategorized'];

        if (!UNCATEGORIZED_ID) {
            throw new Error("'Uncategorized' category missing from database.");
        }
    } catch (e) {
        console.error("Fatal Database Error:", e.message);
        process.exit(1);
    }

    // 4. Process Each Pair Sequentially
    let totalImported = 0;

    for (const pair of importPairs) {
        console.log(`\n------------------------------------------------`);
        console.log(`📂 Processing: ${pair.filePath} (${pair.mapKey})`);
        
        try {
            const count = await processSingleImport(pair.filePath, pair.mapKey);
            totalImported += count;
        } catch (err) {
            console.error(`❌ Failed to import ${pair.filePath}: ${err.message}`);
        }
    }

    console.log(`\n------------------------------------------------`);
    console.log(`✅ Batch Complete. Total Transactions Imported: ${totalImported}`);
}

// --- CORE PROCESSING LOGIC ---

async function processSingleImport(filePath, mapKey) {
    // 1. Validation
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
    }

    const fieldMap = INSTITUTION_MAPS[mapKey];
    if (!fieldMap) {
        throw new Error(`Unknown institution key '${mapKey}'. Check maps.json.`);
    }

    // 2. Account Setup
    const accountConfig = fieldMap.account;
    if (!accountConfig || !accountConfig.name) {
        throw new Error("Missing 'account' configuration in maps.json.");
    }

    const targetAccountId = db.getOrCreateAccount(
        accountConfig.name, 
        accountConfig.type, 
        accountConfig.initial_balance
    );

    // 3. Build Context-Specific Lookups
    let bankIdMap = {};
    if (fieldMap.category_mappings) {
        bankIdMap = buildBankToInternalIdMap(fieldMap.category_mappings, INTERNAL_CATEGORY_IDS);
    }

    const classificationRules = prepareRules(fieldMap.rules, INTERNAL_CATEGORY_IDS);

    // 4. Parse File
    const transactions = await processCsvFile(
        filePath, 
        fieldMap, 
        targetAccountId, 
        classificationRules, 
        bankIdMap 
    );

    // 5. Insert
    if (transactions.length > 0) {
        const count = db.insertBatchTransactions(transactions);
        console.log(`   -> Inserted ${count} transactions into '${accountConfig.name}'.`);
        return count;
    } else {
        console.log(`   -> No valid transactions found.`);
        return 0;
    }
}

// --- HELPER FUNCTIONS ---

function normalizeDate(dateStr, formatStr) {
    if (!dateStr || !formatStr) return null;
    try {
        const date = parse(dateStr, formatStr, new Date());
        if (!isValid(date)) return null;
        return format(date, 'yyyy-MM-dd');
    } catch (e) { return null; }
}

function buildBankToInternalIdMap(mappings, internalIds) {
    const lookup = {};
    for (const mapping of mappings) {
        const bankCat = mapping.bank_cat.toUpperCase().trim();
        const internalId = internalIds[mapping.internal_cat];
        if (internalId) {
            lookup[bankCat] = internalId;
        }
    }
    return lookup;
}

function prepareRules(rawRules, categoryIds) {
    if (!rawRules || !Array.isArray(rawRules)) return [];
    const compiledRules = [];
    for (const rule of rawRules) {
        try {
            compiledRules.push({
                regex: new RegExp(rule.match, 'i'),
                categoryId: rule.category ? categoryIds[rule.category] : null,
                partyName: rule.party || null
            });
        } catch (err) { console.warn(`Invalid Regex: ${rule.match}`); }
    }
    return compiledRules;
}

function applyRules(transaction, rules) {
    const normalizedDescription = transaction.description ? transaction.description.toLowerCase() : '';
    for (const rule of rules) {
        if (rule.regex.test(normalizedDescription)) {
            if (rule.categoryId) transaction.category_id = rule.categoryId;
            if (rule.partyName) transaction.party_name = rule.partyName;
            return;
        }
    }
}

function processCsvFile(filePath, fieldMap, targetAccountId, rules, bankIdMap) {
    const results = [];
    const dateFormat = fieldMap.dateFormat;

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv({
                mapHeaders: ({ header, index }) => {
                    // 1. Strip the BOM (Byte Order Mark) if present
                    let cleanHeader = header.replace(/^\uFEFF/, '');
                    
                    // 2. Strip surrounding double quotes if the parser missed them
                    // This turns '"Date"' into 'Date'
                    cleanHeader = cleanHeader.replace(/^"|"$/g, '');
                    
                    // 3. Trim whitespace
                    return cleanHeader.trim();
                }
            }))
            .on('data', (data) => {
                try {
                    const rawDate = data[fieldMap['Date']];
                    let rawAmount = data[fieldMap['Amount']];
                    const rawPayee = data[fieldMap['Payee']];
                    const rawBankCategory = data[fieldMap['BankCategory']]; 

                    const isoDate = normalizeDate(rawDate, dateFormat);
                    if (rawAmount) rawAmount = rawAmount.replace(/[^0-9.-]/g, '');

                    if (!rawPayee || rawPayee.trim().length === 0) {
                        return; // Skip this row silently
                    }
                    
                    if (!isoDate || !rawAmount) return;

                    let categoryId = UNCATEGORIZED_ID;
                    if (rawBankCategory) {
                        const bankCatKey = rawBankCategory.toUpperCase().trim();
                        if (bankIdMap && bankIdMap[bankCatKey]) {
                            categoryId = bankIdMap[bankCatKey];
                        }
                    }

                    const mappedTx = {
                        date: isoDate, 
                        amount: parseFloat(rawAmount),
                        description: rawPayee,
                        party_name: rawPayee, 
                        account_id: targetAccountId,
                        category_id: categoryId
                    };

                    if (rules && rules.length > 0) {
                        applyRules(mappedTx, rules);
                    }
                    
                    if (!isNaN(mappedTx.amount)) {
                        results.push(mappedTx);
                    }
                } catch (rowError) { }
            })
            .on('end', () => resolve(results))
            .on('error', (err) => reject(err));
    });
}

runImport();