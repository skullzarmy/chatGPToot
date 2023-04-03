const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");

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

// Install and start Redis based on the OS
const isWindows = process.platform === "win32";
const isMac = process.platform === "darwin";
const isLinux = process.platform === "linux";

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                resolve(stdout ? stdout : stderr);
            }
        });
    });
}

async function installAndStartRedis() {
    if (isMac) {
        try {
            await runCommand("brew --version");
        } catch (error) {
            console.error("Homebrew not found. Please install it from https://brew.sh/");
            process.exit(1);
        }

        try {
            await runCommand("brew list redis");
        } catch (error) {
            console.log("Installing Redis via Homebrew...");
            await runCommand("brew install redis");
        }

        console.log("Starting Redis...");
        await runCommand("brew services start redis");
    } else if (isLinux) {
        try {
            await runCommand("redis-server --version");
        } catch (error) {
            console.log("Installing Redis via apt-get...");
            await runCommand("sudo apt-get update");
            await runCommand("sudo apt-get install redis-server");
        }

        console.log("Starting Redis...");
        await runCommand("sudo service redis-server start");
    } else if (isWindows) {
        console.error(
            "Please download and install Redis for Windows manually from https://github.com/microsoftarchive/redis/releases"
        );
        process.exit(1);
    } else {
        console.error("Unsupported platform. Please install and start Redis manually.");
        process.exit(1);
    }

    console.log("Redis installed and started successfully.");
}

installAndStartRedis().catch((error) => {
    console.error(`Error: ${error.message}`);
});
