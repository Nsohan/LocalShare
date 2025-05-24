document.addEventListener('DOMContentLoaded', () => {
  // Load shared files info initially
  loadFiles();

  // Set up event listeners
  document.getElementById('refresh-btn').addEventListener('click', loadFiles);
  document.getElementById('show-qr').addEventListener('click', showQRCode);
  document.getElementById('about-link').addEventListener('click', showAbout);
  document.getElementById('restart-server').addEventListener('click', restartServer);
});

// Function to load shared files
function loadFiles() {
  const container = document.getElementById('shared-file');
  container.innerHTML = '<p>Loading file information...</p>';

  fetch('/api/shared-file')
    .then(res => res.json())
    .then(data => {
      if (data && data.length > 0) {
        const fileItems = data.map(file => `
          <div class="file-item">
            <p>Currently sharing:</p>
            <p class="file-name">${file.fileName}</p>
            <a href="${file.downloadUrl}" class="download-btn" download>Download File</a>
          </div>
        `).join('');
        container.innerHTML = fileItems;
      } else {
        container.innerHTML = `
          <p class="no-file">No files have been shared yet.</p>
          <p>Right-click a file in File Explorer, select "Send to", and choose LocalShare to share a file.</p>
        `;
      }
    })
    .catch(error => {
      container.innerHTML = `<p class="no-file">Error connecting to server. Please try again.</p>`;
      console.error('Error loading files:', error);
    });
}

// Function to show QR Code window
function showQRCode() {
  // This will be handled by the main process
  // We'll send an IPC message if we're in Electron
  if (window.electron) {
    window.electron.send('show-qrcode');
  } else {
    // Fallback for browser testing
    window.open('/qrcode', 'QR Code', 'width=300,height=350');
  }
}

// Function to show About window
function showAbout() {
  // This will be handled by the main process
  // We'll send an IPC message if we're in Electron
  if (window.electron) {
    window.electron.send('show-about');
  } else {
    // Fallback for browser testing
    window.open('/about', 'About LocalShare', 'width=320,height=230');
  }
}

// Function to restart server
function restartServer() {
  fetch('/api/restart-server')
    .then(res => res.json())
    .then(data => {
      alert('Server restarted successfully!');
      setTimeout(loadFiles, 1000); // Reload files after server restart
    })
    .catch(error => {
      alert('Failed to restart server. Please try again.');
      console.error('Error restarting server:', error);
    });
}