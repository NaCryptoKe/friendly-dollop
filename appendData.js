const { google } = require('googleapis');
const path = require('path');

async function main() {
    // IMPORTANT: Replace the file path below with the location of your
    // service account JSON key file. NEVER hardcode the private key directly in your source code.
    const keyFilePath = path.join(__dirname, 'service-account-key.json');

    // Create auth client using the key file path.
    // GoogleAuth will automatically load the credentials object from the file.
    const auth = new google.auth.GoogleAuth({
        keyFile: keyFilePath,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    // Get a client instance for the Sheets API
    const sheets = google.sheets({ version: 'v4', auth });

    // --- Configuration ---
    // 1. Replace with your actual Spreadsheet ID
    const spreadsheetId = '1oXGUpRGnxjpd_pVvnaV0O0lHcAc8A2dycslU8mNUvA4';

    // 2. The A1 range to write to. Using A1 will start writing from the top-left.
    const range = 'Sheet1!A1';

    // 3. Values to write (a 2D array: rows of columns)
    const values = [
        ['Timestamp', 'Name', 'Score', 'Status'],
        [new Date().toISOString(), 'Nahom', 99, 'Success']
    ];
    // ----------------------

    console.log(`Attempting to write data to spreadsheet ID: ${spreadsheetId}`);
    try {
        const res = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range,
            valueInputOption: 'RAW', // 'RAW' treats input as raw strings/numbers. Use 'USER_ENTERED' for formatting/formulas.
            resource: { values },
        });

        console.log('✅ Update successful!');
        console.log('Response data:', res.data);
        console.log(`Wrote ${res.data.updatedCells} cells starting at range ${res.data.updatedRange}.`);
    } catch (err) {
        console.error('❌ Error writing to sheet:');
        // Check for specific error details to help debug permissions or sheet ID issues
        if (err.response && err.response.data) {
            console.error('API Error details:', err.response.data);
        } else {
            console.error(err);
        }
    }
}

main().catch(console.error);