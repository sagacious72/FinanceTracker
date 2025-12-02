// renderer.js
async function renderCashFlowChart() {
    // 1. Fetch Data
    const data = await window.api.invokeDbQuery('getMonthlyCashFlow');
    
    if (!data || data.error) {
        console.error("Failed to fetch cash flow data", data?.error);
        return;
    }

    // 2. Prepare Arrays for Chart.js
    const labels = data.map(row => row.month);
    const incomeData = data.map(row => row.total_income);
    const expenseData = data.map(row => row.total_expense);
    const netData = data.map(row => row.net_change);

    // 3. Configure and Render Chart
    const ctx = document.getElementById('cashFlowChart').getContext('2d');
    
    const myChart = new Chart(ctx, {
        type: 'bar', // Base type is bar
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Net Change',
                    data: netData,
                    type: 'line', // Override type for this dataset
                    borderColor: 'rgba(54, 162, 235, 1)',
                    borderWidth: 2,
                    tension: 0.3, // Curve the line slightly
                    fill: false,
                    yAxisID: 'y' // Bind to main axis
                },
                {
                    label: 'Income',
                    data: incomeData,
                    backgroundColor: 'rgba(75, 192, 192, 0.6)', // Green
                    borderColor: 'rgba(75, 192, 192, 1)',
                    borderWidth: 1,
                    stack: 'Stack 0' // Separate stack so they don't sit on top of expenses
                },
                {
                    label: 'Expenses',
                    data: expenseData,
                    backgroundColor: 'rgba(255, 99, 132, 0.6)', // Red
                    borderColor: 'rgba(255, 99, 132, 1)',
                    borderWidth: 1,
                    stack: 'Stack 1' // Separate stack
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    stacked: true, // Needed for stacking bars (if you wanted to)
                    title: { display: true, text: 'Month' }
                },
                y: {
                    beginAtZero: true,
                    title: { display: true, text: 'Amount ($)' }
                }
            },
            onClick: (evt) => {
                const points = myChart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true);

                if (points.length) {
                    const firstPoint = points[0];
                    const datasetIndex = firstPoint.datasetIndex;
                    const index = firstPoint.index;
                    
                    // 1. Identify Month
                    const labelMonth = myChart.data.labels[index]; // e.g., "2025-01"

                    // 2. Identify Type based on Dataset Index
                    // Index 0 = Net Line (Ignore)
                    // Index 1 = Income Bar
                    // Index 2 = Expense Bar
                    let type = null;
                    if (datasetIndex === 1) type = 'INCOME';
                    if (datasetIndex === 2) type = 'EXPENSE';

                    if (type && labelMonth) {
                        fetchAndDisplayDrillDown(labelMonth, type);
                    }
                }
            },
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false, // Tooltip shows all 3 values when hovering the month column
                }
            }
        }
    });
}

// Global variable to track the pie chart instance
let drillDownChartInstance = null; 
// --- STATE VARIABLES ---
let currentTransactions = []; // Store raw data here
let sortOrder = { column: 'date', direction: 'desc' }; // Default sort state

/**
 * Handler for Header Clicks
 */
function handleSort(column) {
    // Toggle direction if clicking the same column, otherwise reset to asc
    if (sortOrder.column === column) {
        sortOrder.direction = sortOrder.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortOrder.column = column;
        sortOrder.direction = 'asc';
    }
    renderTransactionTable();
}

/**
 * Renders the table body based on currentTransactions and sortOrder
 */
function renderTransactionTable() {
    const tbody = document.getElementById('drillDownBody');
    tbody.innerHTML = '';

    // 1. SORT THE DATA IN PLACE
    currentTransactions.sort((a, b) => {
        let valA = a[sortOrder.column];
        let valB = b[sortOrder.column];
        
        // Handle nulls
        if (valA == null) valA = '';
        if (valB == null) valB = '';

        // Number comparison for amount
        if (sortOrder.column === 'amount') {
            return sortOrder.direction === 'asc' ? valA - valB : valB - valA;
        }

        // String comparison for everything else
        valA = valA.toString().toLowerCase();
        valB = valB.toString().toLowerCase();

        if (valA < valB) return sortOrder.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder.direction === 'asc' ? 1 : -1;
        return 0;
    });

    // 2. RENDER ROWS (Same logic as before)
    if (currentTransactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No transactions found.</td></tr>';
        return;
    }

    currentTransactions.forEach(tx => {
        const row = document.createElement('tr');
        const isTransfer = tx.category_type === 'TRANSFER';
        
        let amtStyle = isTransfer ? 'color: #666;' : (tx.amount >= 0 ? 'color: green' : 'color: red');
        let rowStyle = isTransfer ? 'background-color: #f0f0f0; color: #666; font-style: italic;' : '';

        row.style = rowStyle;
        row.innerHTML = `
            <td>${tx.date}</td>
            <td>${tx.party_name || '-'}</td>
            <td>${tx.description}</td>
            <td>${tx.category_name} ${isTransfer ? '(Transfer)' : ''}</td>
            <td style="${amtStyle} text-align: right;">${tx.amount.toFixed(2)}</td>
        `;
        tbody.appendChild(row);
    });
    
    //updateHeaderIcons(); // Optional: visual cue for sort direction
}

async function fetchAndDisplayDrillDown(month, type) {
    console.log(`Drilling down into ${month} - ${type}`);
    
    const container = document.getElementById('drillDownContainer');
    const title = document.getElementById('drillDownTitle');
    const tbody = document.getElementById('drillDownBody');

    // 1. Fetch BOTH datasets in parallel
    const [transactions, breakdown] = await Promise.all([
        window.api.invokeDbQuery('getTransactionsByMonthAndType', { month, type }),
        window.api.invokeDbQuery('getCategoryBreakdown', { month, type })
    ]);

/*    // 2. Update UI Title
    title.textContent = `${type} Details for ${month}`;

    // --- RENDER TABLE (Existing Logic) ---
    tbody.innerHTML = '';
    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5">No transactions found.</td></tr>';
    } else {
        transactions.forEach(tx => {
            const row = document.createElement('tr');
            const isTransfer = tx.category_type === 'TRANSFER';
            
            let amtStyle = '';
            let rowStyle = '';

            if (isTransfer) {
                rowStyle = 'background-color: #f0f0f0; color: #666; font-style: italic;';
                amtStyle = 'color: #666;'; 
            } else {
                amtStyle = tx.amount >= 0 ? 'color: green' : 'color: red';
            }

            row.style = rowStyle;
            row.innerHTML = `
                <td>${tx.date}</td>
                <td>${tx.party_name || '-'}</td>
                <td>${tx.description}</td>
                <td>${tx.category_name}</td>
                <td style="${amtStyle} text-align: right;">${tx.amount.toFixed(2)}</td>
            `;
            tbody.appendChild(row);
        });
    }*/
    // 2. STORE DATA GLOBALLY
    currentTransactions = transactions;

    // 3. Render Initial Table (using default sort)
    renderTransactionTable();

    // --- RENDER PIE CHART (New Logic) ---
    renderDrillDownPie(breakdown, type);

    // Show Container
    container.style.display = 'block';
    container.scrollIntoView({ behavior: 'smooth' });
}

function renderDrillDownPie(data, type) {
    const ctx = document.getElementById('drillDownPieChart').getContext('2d');

    // DESTROY previous chart instance if it exists
    if (drillDownChartInstance) {
        drillDownChartInstance.destroy();
    }

    if (!data || data.length === 0) {
        return;
    }

    const labels = data.map(row => row.name);
    const values = data.map(row => row.total);

    drillDownChartInstance = new Chart(ctx, {
        type: 'doughnut', // 'doughnut' looks slightly more modern than 'pie'
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: [
                    '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40',
                    '#C9CBCF', '#7BC225', '#B55A30', '#E9967A' 
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom', // Move legend to bottom to save width
                    labels: { boxWidth: 10, font: { size: 10 } }
                },
                title: {
                    display: true,
                    text: 'By Category'
                }
            }
        }
    });
}

async function loadInitialData() {
    console.log("Loading All Time Data...");
    
    const container = document.getElementById('drillDownContainer');
    const title = document.getElementById('drillDownTitle');
    
    // 1. Fetch All-Time Data
    const [transactions, breakdown] = await Promise.all([
        window.api.invokeDbQuery('getAllTransactionsDetailed'),
        window.api.invokeDbQuery('getCategoryBreakdownAllTime')
    ]);

    // 2. Set Global State (for sorting)
    currentTransactions = transactions;

    // 3. Update UI
    title.textContent = "All Transactions (All Time Expenses)";
    
    // 4. Render Table
    renderTransactionTable(); // Reuses your existing sort/render logic

    // 5. Render Pie Chart
    renderDrillDownPie(breakdown, 'EXPENSE'); // Reuses your existing chart logic

    // 6. Make Visible
    container.style.display = 'block';
}

// Call this function when the app loads
document.addEventListener('DOMContentLoaded', () => {
    renderCashFlowChart(); // Top Bar Chart
    loadInitialData();     // Bottom Pie Chart & Table (Default View)
});

// Expose handleSort so HTML onclick="..." can find it
window.handleSort = handleSort;