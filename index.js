import express from "express";
import multer from "multer";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { google } from "googleapis";
// NOTE: Removed dotenv import as Vercel uses environment variables directly.

const app = express();
// Using the only writable directory on Vercel's file system
const upload = multer({ dest: "/tmp" }); 
// Vercel handles serving static files automatically, but this ensures express can still access them.
// The Vercel routing takes precedence for the base path.
// NOTE: Removed path import as it's not strictly needed for this file and Vercel's routing handles 'public'.

// ===== GOOGLE SHEETS SETUP (VERCEL-READY) ======
const serviceAccountBase64 = process.env.GOOGLE_SERVICE_KEY_BASE64;

if (!serviceAccountBase64) {
    // This will cause the function to fail early in the Vercel logs if the secret is missing.
    throw new Error("GOOGLE_SERVICE_KEY_BASE64 env var is not set in Vercel!");
}

// Decode the Base64 string into a JSON credentials object
const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
const credentials = JSON.parse(serviceAccountJson);

const auth = new google.auth.GoogleAuth({
    credentials, 
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = "1oXGUpRGnxjpd_pVvnaV0O0lHcAc8A2dycslU8mNUvA4";
const sheetName = "Sheet1";

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
        // Robust JSON parsing (strips Markdown code block fence)
        const jsonText = text.replace(/^```json\s*/, "").replace(/```$/, "");
        const parsed = JSON.parse(jsonText);
        
        console.log("Parsed Values:\n", parsed);

        // Generate timestamp
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

// Vercel will handle the incoming HTTP requests and map them to this app instance.
// We export the app to be consumed by the Vercel Node Runtime.
export default app;
