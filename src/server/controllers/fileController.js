/**
 * File controller for handling file download and upload requests
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const multer = require('multer');
const { formatFileSize } = require('../utils');

// Upload destination directory
const UPLOAD_DIR = path.join(os.homedir(), 'Downloads', 'LocalShare');
try {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
} catch (e) {
  console.error('Could not create upload directory:', e);
}

// Setup multer disk storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(UPLOAD_DIR)) {
      fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    let originalName = file.originalname;
    try {
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (e) {
      originalName = file.originalname;
    }

    const ext = path.extname(originalName);
    const base = path.basename(originalName, ext);
    let finalPath = path.join(UPLOAD_DIR, originalName);

    if (fs.existsSync(finalPath)) {
      const timestamp = Date.now().toString().slice(-4);
      cb(null, `${base}_${timestamp}${ext}`);
    } else {
      cb(null, originalName);
    }
  }
});

const uploadMiddleware = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 * 1024 } // 10 GB limit
});

/**
 * Download a shared file by its ID
 */
function downloadFile(req, res) {
  const fileId = parseInt(req.params.id);
  const file = global.sharedFiles ? global.sharedFiles.find(f => f.id === fileId) : null;

  if (!file || !fs.existsSync(file.path)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>File Not Found - LocalShare</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              text-align: center;
              padding: 50px 20px;
              background: #0b0f19;
              color: #f8fafc;
            }
            .error-card {
              max-width: 440px;
              margin: 0 auto;
              padding: 32px 24px;
              border: 1px solid rgba(255,255,255,0.1);
              border-radius: 12px;
              background: #1e293b;
              box-shadow: 0 10px 30px rgba(0,0,0,0.4);
            }
            h2 { color: #f43f5e; margin-bottom: 12px; font-size: 1.4rem; }
            p { color: #94a3b8; font-size: 0.95rem; margin-bottom: 24px; }
            a {
              display: inline-block;
              padding: 10px 24px;
              background: #6366f1;
              color: white;
              text-decoration: none;
              border-radius: 8px;
              font-weight: 500;
            }
            a:hover { background: #4f46e5; }
          </style>
        </head>
        <body>
          <div class="error-card">
            <h2>File Not Found</h2>
            <p>The requested file is no longer being shared or has been removed by the host.</p>
            <a href="/">Return to Home</a>
          </div>
        </body>
      </html>
    `);
  }

  console.log(`File download requested: ${file.name}`);
  res.download(file.path, file.name);
}

/**
 * Handle incoming file uploads from client devices
 */
function uploadFiles(req, res) {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }

  const savedFiles = req.files.map((file, index) => {
    const ext = path.extname(file.filename).toLowerCase().replace('.', '');
    return {
      id: Date.now() + index,
      name: file.filename,
      path: file.path,
      size: formatFileSize(file.size),
      sizeBytes: file.size,
      extension: ext || 'file',
      dateAdded: new Date().toISOString()
    };
  });

  // Send IPC message to parent Electron process if running
  if (process.send) {
    try {
      process.send({
        type: 'files-received',
        files: savedFiles
      });
    } catch (ipcErr) {
      console.error('IPC message error:', ipcErr);
    }
  }

  res.json({
    success: true,
    message: `Successfully uploaded ${savedFiles.length} file(s)`,
    files: savedFiles
  });
}

module.exports = {
  downloadFile,
  uploadFiles,
  uploadMiddleware,
  UPLOAD_DIR
};