# 🚀 LocalShare Release Guide

This document explains the release workflow, versioning conventions, and release automation tools for **LocalShare**.

---

## 📌 Release Overview

LocalShare uses a streamlined, 1-click automated release pipeline implemented in [`release.ps1`](file:///e:/Development/PC_Software/LocalShare/release.ps1).

The release pipeline handles:
1. **Version Detection**: Parses the version string from [`package.json`](file:///e:/Development/PC_Software/LocalShare/package.json).
2. **Automated Packaging**: Builds the Windows NSIS Setup installer using `npm run package` via Electron Builder.
3. **Asset Standardization**: Copies the built binary to standard names in `dist/`:
   - `LocalShare-Setup-v<version>.exe`
   - `LocalShare-Setup.exe`
4. **Checksum & Size Verification**: Computes SHA-256 hashes and file size metrics.
5. **Release Notes Resolution**: Automatically picks up `RELEASE_NOTES_v<version>.md` (or generates release notes from git commit log).
6. **Git Tagging & Branch Push**: Creates an annotated git tag (`v<version>`) and pushes code & tags to GitHub.
7. **GitHub Release Publication**: Uses the GitHub REST API (authenticated via Git Credential Manager or `$env:GITHUB_TOKEN`) to publish the release and stream uploaded binary assets with progress bars.

---

## 🛠️ How to Create a New Release

### 1. Update Version and Release Notes
1. Update the `"version"` field in [`package.json`](file:///e:/Development/PC_Software/LocalShare/package.json) (e.g. `"1.0.0"`).
2. Create or update `RELEASE_NOTES_v<version>.md` with key highlights, new features, and changes.

### 2. Test with Dry Run (Recommended)
Preview the release steps without modifying git or creating releases:
```powershell
.\release.ps1 -DryRun
# or using npm
npm run release:dry
```

### 3. Publish the Release
Run the automated release script:
```powershell
.\release.ps1
# or using npm
npm run release
```

---

## ⚙️ Command-Line Parameters

| Parameter | Type | Description |
| :--- | :--- | :--- |
| `-Version <str>` | String | Override target version (e.g., `1.0.0`). Defaults to `package.json`. |
| `-NotesFile <path>` | String | Specify custom markdown notes file. |
| `-Notes <str>` | String | Pass raw markdown release notes directly. |
| `-Token <token>` | String | Custom GitHub Personal Access Token. |
| `-Draft` | Switch | Create release as draft instead of publishing immediately. |
| `-PreRelease` | Switch | Mark release as a pre-release. |
| `-AutoCommit` | Switch | Automatically commit unstaged working tree changes before tagging. |
| `-SkipBuild` | Switch | Skip building the installer with `npm run package` (uses existing `dist/` binary). |
| `-SkipPush` | Switch | Build and tag locally without pushing to GitHub or creating GitHub release. |
| `-DryRun` | Switch | Simulate execution without creating tags, pushing, or uploading. |

---

## 🔐 GitHub Authentication

The script automatically detects authentication credentials in this order:
1. `-Token` CLI parameter.
2. `$env:GITHUB_TOKEN` or `$env:GH_TOKEN` environment variable.
3. Windows **Git Credential Manager** (used by `git push`).

If no token is found, the script automatically copies your release notes to the clipboard and opens the GitHub Release draft page and `dist/` folder in File Explorer for quick manual upload.
