const { ipcRenderer } = require("electron");

// Tab switching
document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => {
    // Update active tab
    document
      .querySelectorAll(".tab-button")
      .forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");

    // Show/hide tab content
    document.querySelectorAll(".tab-content").forEach((content) => {
      content.style.display =
        content.id === button.dataset.tab ? "block" : "none";
    });
  });
});

// Format date for display
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString();
}

// Render file list with additional details
function renderFileList(files, listId, tab) {
  const list = document.getElementById(listId);
  list.innerHTML = "";
  files.forEach((file) => {
    const li = document.createElement("li");
    li.classList.add("file-item");
    li.innerHTML = `
      <div class="file-info">
        <span class="file-name">${file.name}</span>
        <span class="file-details">Size: ${file.size} | Added: ${formatDate(
      file.dateAdded
    )}</span>
      </div>
      <button class="remove-btn" data-id="${
        file.id
      }" data-tab="${tab}">Remove</button>
    `;
    list.appendChild(li);
  });

  // Add remove button listeners
  list.querySelectorAll(".remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      ipcRenderer.send("remove-file", {
        id: parseInt(btn.dataset.id),
        tab: btn.dataset.tab,
      });
    });
  });
}

// Fetch initial file lists
ipcRenderer.send("get-file-lists");
ipcRenderer.on("file-lists", (event, { sentFiles, receivedFiles }) => {
  renderFileList(sentFiles, "sentFilesList", "send");
  renderFileList(receivedFiles, "receivedFilesList", "received");
});

// Update file lists after removal
ipcRenderer.on("files-updated", (event, { sentFiles, receivedFiles }) => {
  renderFileList(sentFiles, "sentFilesList", "send");
  renderFileList(receivedFiles, "receivedFilesList", "received");
});

// Handle Remove All buttons
document.getElementById("removeAllSentBtn").addEventListener("click", () => {
  ipcRenderer.send("remove-all-files", "send");
});
document
  .getElementById("removeAllReceivedBtn")
  .addEventListener("click", () => {
    ipcRenderer.send("remove-all-files", "received");
  });

// Settings button
document.getElementById("settingsBtn").addEventListener("click", () => {
  ipcRenderer.send("open-settings");
});
