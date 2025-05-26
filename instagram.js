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
      throw new Error(`Instagram download failed: ${result[0].error || 'Unknown error'}`);
    }
  } catch (error) {
    throw new Error(`Instagram download failed: ${error.message}`);
  }
}

module.exports = { downloadInstagramVideo };
