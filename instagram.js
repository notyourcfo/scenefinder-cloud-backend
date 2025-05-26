const { PythonShell } = require('python-shell');
const fs = require('fs').promises;
const path = require('path');

async function downloadInstagramVideo(url, outputPath) {
const scriptPath = path.join(__dirname, 'instagram_download.py');
const options = {
mode: 'json',
pythonOptions: ['-u'],
args: [url, outputPath, process.env.INSTAGRAM_USERNAME, process.env.INSTAGRAM_PASSWORD]
};

try {
const result = await PythonShell.run(scriptPath, options);
if (result[0].success) {
return result[0].filePath;
} else {
throw new Error(result[0].error || 'Failed to download Instagram video');
}
} catch (error) {
throw new Error(Instagram download failed: );
}
}

module.exports = { downloadInstagramVideo };
