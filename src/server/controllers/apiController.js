/**
 * API controller for handling API requests
 */
const path = require('path');
const notifier = require('node-notifier');

/**
 * Get list of shared files
 */
function getSharedFiles(req, res) {
  if (global.sharedFiles && global.sharedFiles.length > 0) {
    res.json(
      global.sharedFiles.map(file => ({
        id: file.id,
        fileName: file.name,
        downloadUrl: `/download/${file.id}`,
        size: file.size || 'Unknown',
        dateAdded: file.dateAdded || new Date().toISOString()
      }))
    );
  } else {
    res.json([]);
  }
}

/**
 * Send notification to the server admin
 */
function sendNotification(req, res) {
  const title = req.query.title || 'LocalShare Notification';
  const message = req.query.message || 'A notification has been triggered';

  notifier.notify({
    title,
    message,
    icon: path.join(__dirname, '../../../icon.png')
  });

  res.json({
    success: true,
    message: 'Notification sent to server admin!'
  });
}

module.exports = {
  getSharedFiles,
  sendNotification
};