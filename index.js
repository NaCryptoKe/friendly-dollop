import express from "express";
import multer from "multer";
import fs from "fs";
import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
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


const port = 5000;

app.listen(port, () => {
    console.log(`🔥 Server running on http://localhost:${port}`);
});