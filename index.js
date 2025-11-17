import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import dotenv from "dotenv";
dotenv.config();

const app = express();
// --- FIX 1: Use /tmp directory for Multer ---
const upload = multer({ dest: "/tmp" });
app.use(express.static(path.join(process.cwd(), "public")));

// ===== GOOGLE SHEETS SETUP (VERCEL-READY) ======
// 1. Get the Base64 string from environment variables
const serviceAccountBase64 = process.env.GOOGLE_SERVICE_KEY_BASE64;
if (!serviceAccountBase64) {
    throw new Error("GOOGLE_SERVICE_KEY_BASE64 env var is not set!");
}
// 2. Decode the Base64 string into a JSON string
const serviceAccountJson = Buffer.from(serviceAccountBase64, 'base64').toString('utf8');
// 3. Parse the JSON string into an object
const credentials = JSON.parse(serviceAccountJson);

// 4. Use the credentials object instead of keyFile
const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const sheets = google.sheets({ version: "v4", auth });
const spreadsheetId = "1oXGUpRGnxjpd_pVvnaV0O0lHcAc8A2dycslU8mNUvA4";
const sheetName = "Sheet1";

// ===== GEMINI SETUP =====
const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GENAI_KEY });

// ===== EXPRESS ENDPOINT =====
app.post("/upload", upload.single("photo"), async (req, res) => {
    try {
        const imagePath = req.file.path;
        const base64ImageFile = fs.readFileSync(imagePath, { encoding: "base64" });

        const contents = [
            { inlineData: { mimeType: "image/jpeg", data: base64ImageFile } },
            { text: "Extract metrics as JSON ONLY: bodyAge, height, weight, bmi, bodyType, fat, water, muscle, bone, entrails, bmr" },
        ];

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents
        });

        const text = response.text.trim();
        const jsonText = text.replace(/^```json\s*/, "").replace(/```$/, "");
        const parsed = JSON.parse(jsonText);
        console.log("Parsed Values:\n", parsed);

        const now = new Date();
        const formattedDate = now.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        const formattedTime = now.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        });

        const row = [
            formattedDate,
            formattedTime,
            parsed.bodyAge,
            parsed.height,
            parsed.weight,
            parsed.bmi,
            parsed.bodyType,
            parsed.fat,
            parsed.water,
            parsed.muscle,
            parsed.bone,
            parsed.entrails,
            parsed.bmr
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: sheetName,
            valueInputOption: "RAW",
            insertDataOption: "INSERT_ROWS",
            resource: { values: [row] },
        });

        console.log("Uploaded file path:", imagePath);
        console.log("File exists?", fs.existsSync(imagePath));
        res.json({
            message: "Values extracted + logged to spreadsheet!",
            parsed
        });

        fs.unlinkSync(imagePath);

    } catch (err) {
        console.error("❌ Error:", err);
        res.status(500).json({ error: "Failed to process image." });
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
        console.error(err);
        res.status(500).json({ error: "Failed to fetch data from sheet." });
    }
});

export default app;
