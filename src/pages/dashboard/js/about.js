const os = require("os");

function populateAboutView() {
  const aboutRuntime = document.getElementById("aboutRuntime");
  const aboutPlatform = document.getElementById("aboutPlatform");

  if (aboutRuntime) {
    aboutRuntime.textContent = `Electron ${process.versions.electron} & Node.js ${process.version}`;
  }
  if (aboutPlatform) {
    aboutPlatform.textContent = `${os.type()} ${os.release()} (${os.arch()})`;
  }
}

module.exports = {
  populateAboutView,
};
