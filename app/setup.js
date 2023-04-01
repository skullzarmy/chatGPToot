const fs = require("fs");
const path = require("path");

// Create folders if they don't exist
const foldersToCreate = ["media", "logs", "reports", "feedback"];
const appRootPath = path.join(__dirname, "..");
foldersToCreate.forEach((folder) => {
    const folderPath = path.join(appRootPath, folder);
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
        console.log(`Created folder: ${folderPath}`);
    }
});

// Copy .env-sample to .env if .env doesn't exist
const envSamplePath = path.join(appRootPath, ".env-sample");
const envPath = path.join(appRootPath, ".env");
if (!fs.existsSync(envPath)) {
    fs.copyFileSync(envSamplePath, envPath);
    console.log(`Created .env file from .env-sample`);
}
