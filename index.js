import express from "express";
import multer from "multer";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
import cors from "cors";
import dotenv from "dotenv";
dotenv.config();
const app = express();
const upload = multer({ dest: "uploads/" });
app.use(express.static(path.join(process.cwd(), "public")));
app.use(cors());
// ===== GOOGLE SHEETS SETUP ======
const auth = new google.auth.GoogleAuth({
    credentials: {
        type: "service_account",
        project_id: process.env.GOOGLE_SERVICE_ACCOUNT_PROJECT_ID,
        private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY,
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL,
        private_key_id: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID,
        auth_uri: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_URI,
        token_uri: process.env.GOOGLE_SERVICE_ACCOUNT_TOKEN_URI,
        auth_provider_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER,
        client_x509_cert_url: process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_CERT,
        universe_domain: process.env.GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN,
        client_id: process.env.GOOGLE_SERVICE_CLIENT_ID,
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});
const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = "1oXGUpRGnxjpd_pVvnaV0O0lHcAc8A2dycslU8mNUvA4";
const sheetName = "Sheet1";
console.log("Client Email:", process.env.GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL);


// ===== GEMINI SETUP =====
const ai = new GoogleGenerativeAI(process.env.GOOGLE_GENAI_KEY);

// ===== EXPRESS ENDPOINT =====
app.post("/upload", upload.single("photo"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
    }

    const imagePath = req.file.path;
    
    try {
        // Read the temporary file created by Multer in /tmp
        const base64ImageFile = fs.readFileSync(imagePath, { encoding: "base64" });

        const contents = [
            { inlineData: { mimeType: "image/jpeg", data: base64ImageFile } },
            { text: "Extract metrics as JSON ONLY: bodyAge, height, weight, bmi, bodyType, fat, water, muscle, bone, entrails, bmr" },
        ];

        const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

        const response = await model.generateContent({ contents });

        const text = response.text.trim();

        // Strip ```json ... ``` if present
        const jsonText = text.replace(/^```json\s*/, "").replace(/```$/, "");
        const parsed = JSON.parse(jsonText);
        
        console.log("Parsed Values:\n", parsed);

        // Generate timestamp at upload time
        const now = new Date();
        const formattedDate = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const formattedTime = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });

        // Create row for Sheets
        const row = [
            formattedDate, formattedTime, parsed.bodyAge, parsed.height, parsed.weight,
            parsed.bmi, parsed.bodyType, parsed.fat, parsed.water, parsed.muscle,
            parsed.bone, parsed.entrails, parsed.bmr
        ];

        // Append to Google Sheets
        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: sheetName,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: { values: [row] },
        });

        res.json({
            message: "Values extracted + logged to spreadsheet!",
            parsed
        });

        // Cleanup
        fs.unlinkSync(imagePath);

    } catch (err) {
        console.error("❌ Error in /upload:", err);
        res.status(500).json({ error: "Failed to process image or log data." });
    } finally {
        // Crucial cleanup step for Vercel's /tmp directory
        if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }
    }
});

// ===== FETCH SHEET DATA =====
app.get("/data", async (req, res) => {
    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: sheetName,
        });
        const rows = response.data.values || [];
        res.json({ rows });
    } catch (err) {
        console.error("❌ Error in /data:", err);
        res.status(500).json({ error: "Failed to fetch data from sheet." });
    }
});


app.listen(5000, () => console.log(`🔥 Server running on port 5000`));