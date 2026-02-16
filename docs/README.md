# Notebook Static Website

A static website for browsing markdown files from the `NoteBook` and `Brain` folders.

## Setup for GitHub Pages

1. **Enable GitHub Pages**:
   - Go to your repository settings on GitHub
   - Navigate to "Pages" in the left sidebar
   - Under "Source", select "Deploy from a branch"
   - Choose the branch (usually `main` or `master`)
   - Select `/docs` as the folder
   - Click "Save"

2. **Access your site**:
   - Your site will be available at: `https://<username>.github.io/<repository-name>/`
   - It may take a few minutes for the site to be available after enabling

## Local Development

To test the website locally, you can use a simple HTTP server:

```bash
# Using Python 3
python3 -m http.server 8000

# Using Node.js (if you have http-server installed)
npx http-server -p 8000

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## File Structure

- `index.html` - Main HTML file
- `styles.css` - Styling
- `app.js` - JavaScript for file navigation and markdown rendering
- `generate-manifest.js` - Script to automatically generate the file manifest
- `README.md` - This file

## Adding New Files

**After adding new markdown files, you need to regenerate the manifest:**

1. Add your markdown files to the `NoteBook` or `Brain` folders
2. Run the manifest generator:
   ```bash
   node docs/generate-manifest.js
   ```
3. Commit and push both the new files and the updated `manifest.json` to GitHub

The website loads files from a static `manifest.json` file to avoid GitHub API rate limiting and CORS issues.

### Why use a manifest file?

- **No API rate limits**: GitHub API has strict rate limits that can cause 403 errors
- **No CORS issues**: Static files work perfectly on GitHub Pages
- **Faster loading**: No need to make multiple API calls
- **More reliable**: Works consistently without authentication

### Note

- The manifest file (`manifest.json`) contains a list of all markdown files
- Main sections (NoteBook and Brain) are collapsible - click the arrow to expand/collapse
- Files are still loaded from GitHub's raw content API (no rate limits for raw content)