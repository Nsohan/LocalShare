/**
 * File controller for handling file download requests
 */
const fs = require('fs');
const path = require('path');
const notifier = require('node-notifier');

/**
 * Download a shared file by its ID
 */
function downloadFile(req, res) {
  const fileId = parseInt(req.params.id);
  const file = global.sharedFiles.find(f => f.id === fileId);

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).send(`
      <html>
        <head>
          <title>File Not Found</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              margin-top: 50px;
              color: #333;
            }
            .error-container {
              max-width: 500px;
              margin: 0 auto;
              padding: 20px;
              border: 1px solid #ddd;
              border-radius: 5px;
              background-color: #f8f8f8;
            }
            h2 { color: #d9534f; }
            a {
              display: inline-block;
              margin-top: 20px;
              color: #337ab7;
              text-decoration: none;
            }
            a:hover { text-decoration: underline; }
          </style>
        </head>
        <body>
          <div class="error-container">
            <h2>File Not Found</h2>
            <p>The requested file no longer exists or has been removed.</p>
            <a href="/">Return to Home</a>
          </div>
        </body>
      </html>
    `);
  }

  // Log download
  console.log(`File download requested: ${file.name}`);

  // Notify about download if notifications are enabled
  // notifier.notify({
  //   title: 'LocalShare',
  //   message: `Someone downloaded: ${file.name}`,
  //   icon: path.join(__dirname, '../../../icon.png')
  // });

  // Send the file for download
  res.download(file.path, file.name);
}

module.exports = {
  downloadFile
};