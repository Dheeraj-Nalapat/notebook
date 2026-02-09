# Notebook Static Website

A static website for browsing markdown files from the `Agent_Reports` and `Brain` folders.

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

**No action needed!** The website automatically discovers all markdown files when it loads.

The site uses GitHub's API to:
- Automatically scan the `Agent_Reports` and `Brain` folders
- Find all `.md` files recursively
- Display them with the correct folder structure
- Update in real-time when you add new files

Just add your markdown files to the folders and push to GitHub. The website will automatically show them on the next page load!

### Note

- Files are discovered using GitHub's public API (no authentication needed for public repos)
- The site fetches files when the page loads
- Main sections (Agent Reports and Brain) are collapsible - click the arrow to expand/collapse
