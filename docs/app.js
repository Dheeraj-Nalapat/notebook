// Auto-discover markdown files using GitHub API
const REPO_OWNER = 'dheeraj-nalapat';
const REPO_NAME = 'notebook';
const BRANCH = 'main'; // Change this if your default branch is different (e.g., 'master')

const getRawUrl = (filePath) => {
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`;
};

const getApiUrl = (path = '') => {
    return `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${path}?ref=${BRANCH}`;
};

// Store discovered files
let fileManifest = {
    agentReports: [],
    brain: []
};

// Fetch markdown files recursively from GitHub API
async function fetchMarkdownFiles(folderPath, basePath = '') {
    const files = [];

    try {
        const response = await fetch(getApiUrl(folderPath));
        if (!response.ok) {
            if (response.status === 404) {
                return files; // Folder doesn't exist
            }
            throw new Error(`Failed to fetch ${folderPath}: ${response.status}`);
        }

        const items = await response.json();

        for (const item of items) {
            if (item.type === 'file' && item.name.endsWith('.md')) {
                const relativePath = basePath ? `${basePath}/${item.name}` : item.name;
                const folder = basePath;
                files.push({
                    name: item.name,
                    path: `${folderPath}/${item.name}`,
                    folder: folder
                });
            } else if (item.type === 'dir') {
                // Recursively fetch from subdirectories
                const subFiles = await fetchMarkdownFiles(
                    `${folderPath}/${item.name}`,
                    basePath ? `${basePath}/${item.name}` : item.name
                );
                files.push(...subFiles);
            }
        }
    } catch (error) {
        console.error(`Error fetching ${folderPath}:`, error);
    }

    return files;
}

// Discover all markdown files
async function discoverFiles() {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const emptyStateEl = document.getElementById('emptyState');

    if (!loadingEl) {
        console.error('Loading element not found');
        return;
    }

    loadingEl.textContent = 'Discovering files...';
    loadingEl.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (emptyStateEl) emptyStateEl.classList.add('hidden');

    try {
        console.log('Fetching files from GitHub API...');
        // Fetch files from both folders in parallel
        const [agentReports, brain] = await Promise.all([
            fetchMarkdownFiles('Agent_Reports'),
            fetchMarkdownFiles('Brain')
        ]);

        console.log('Agent Reports found:', agentReports.length);
        console.log('Brain files found:', brain.length);

        // Process Agent Reports - remove 'Agent_Reports/' prefix from folder
        fileManifest.agentReports = agentReports.map(file => ({
            name: file.name,
            path: file.path,
            folder: file.folder ? file.folder.replace(/^Agent_Reports\//, '').replace(/^Agent_Reports$/, '') : ''
        }));

        // Process Brain files - remove 'Brain/' prefix from folder
        fileManifest.brain = brain.map(file => {
            const folderPath = file.path.replace(/^Brain\//, '').replace(/\/[^/]+\.md$/, '');
            return {
                name: file.name,
                path: file.path,
                folder: folderPath
            };
        });

        // Sort files
        fileManifest.agentReports.sort((a, b) => a.name.localeCompare(b.name));
        fileManifest.brain.sort((a, b) => {
            if (a.folder !== b.folder) {
                return a.folder.localeCompare(b.folder);
            }
            return a.name.localeCompare(b.name);
        });

        loadingEl.classList.add('hidden');
        renderFileList();
        setupMainSectionToggles();

        // Show empty state if no files found
        if (fileManifest.agentReports.length === 0 && fileManifest.brain.length === 0) {
            if (emptyStateEl) {
                emptyStateEl.classList.remove('hidden');
                emptyStateEl.querySelector('p').textContent = 'No markdown files found.';
            }
        }

    } catch (error) {
        console.error('Error discovering files:', error);
        loadingEl.classList.add('hidden');
        if (errorEl) {
            errorEl.classList.remove('hidden');
            errorEl.textContent = `Error discovering files: ${error.message}`;
        }
    }
}

// Setup collapsible main sections
function setupMainSectionToggles() {
    const mainSections = document.querySelectorAll('.main-section');

    mainSections.forEach(section => {
        const header = section.querySelector('.main-header');
        const list = section.querySelector('.file-list');
        const toggle = header.querySelector('.folder-toggle');

        header.addEventListener('click', () => {
            const isExpanded = list.style.display !== 'none';
            list.style.display = isExpanded ? 'none' : 'block';
            toggle.textContent = isExpanded ? '▶' : '▼';
        });

        // Expand by default
        list.style.display = 'block';
        toggle.textContent = '▼';
    });
}

// Build a tree structure from file list
function buildFileTree(files) {
    const tree = {};

    files.forEach(file => {
        const parts = file.folder ? file.folder.split('/') : [];
        let current = tree;

        // Navigate/create folder structure
        parts.forEach(part => {
            if (!current[part]) {
                current[part] = { _files: [] };
            }
            current = current[part];
        });

        // Add file to current folder
        current._files.push(file);
    });

    return tree;
}

// Theme management
function initTheme() {
    // Get saved theme or default to light
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.body.className = `theme-${savedTheme}`;

    // Setup theme toggle
    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            const currentTheme = document.body.classList.contains('theme-dark') ? 'dark' : 'light';
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            document.body.className = `theme-${newTheme}`;
            localStorage.setItem('theme', newTheme);
        });
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    discoverFiles();
    setupSearch();
});

// Render file tree recursively
function renderFileTree(container, tree, level = 0) {
    // Sort keys: folders first, then files
    const keys = Object.keys(tree).sort((a, b) => {
        const aIsFile = a === '_files';
        const bIsFile = b === '_files';
        if (aIsFile && !bIsFile) return 1;
        if (!aIsFile && bIsFile) return -1;
        return a.localeCompare(b);
    });

    keys.forEach(key => {
        if (key === '_files') {
            // Render files in this folder
            tree._files.forEach(file => {
                const li = document.createElement('li');
                li.className = 'file-item';
                const a = document.createElement('a');
                a.href = '#';
                a.textContent = file.name;
                a.dataset.path = file.path;
                a.className = 'file-link';
                // Proper indentation: level * 16 + 40px (files are more indented than folders)
                a.style.paddingLeft = `${level * 16 + 40}px`;
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('Nested file clicked:', file.name, file.path);
                    loadFile(getRawUrl(file.path), a);
                });
                li.appendChild(a);
                container.appendChild(li);
            });
        } else {
            // Render folder
            const folderItem = document.createElement('li');
            folderItem.className = 'folder-item';

            const folderToggle = document.createElement('span');
            folderToggle.className = 'folder-toggle';
            folderToggle.textContent = '▶';
            folderToggle.addEventListener('click', (e) => {
                e.stopPropagation();
                const ul = folderItem.querySelector('ul');
                const isExpanded = ul.style.display !== 'none';
                ul.style.display = isExpanded ? 'none' : 'block';
                folderToggle.textContent = isExpanded ? '▶' : '▼';
            });

            const folderName = document.createElement('span');
            folderName.className = 'folder-name';
            folderName.textContent = key;

            const folderHeader = document.createElement('div');
            folderHeader.className = 'folder-header';
            // Proper indentation: level * 16 + 16px
            folderHeader.style.paddingLeft = `${level * 16 + 16}px`;
            folderHeader.appendChild(folderToggle);
            folderHeader.appendChild(folderName);

            const folderContent = document.createElement('ul');
            folderContent.className = 'file-list nested';
            folderContent.style.display = 'none'; // Collapsed by default

            folderItem.appendChild(folderHeader);
            folderItem.appendChild(folderContent);
            container.appendChild(folderItem);

            // Recursively render nested structure
            renderFileTree(folderContent, tree[key], level + 1);
        }
    });
}

// Render file lists in sidebar
function renderFileList() {
    const agentReportsList = document.getElementById('agentReportsList');
    const brainList = document.getElementById('brainList');

    if (!agentReportsList || !brainList) {
        console.error('File list containers not found');
        return;
    }

    // Clear existing content
    agentReportsList.innerHTML = '';
    brainList.innerHTML = '';

    console.log('Rendering file list...', {
        agentReports: fileManifest.agentReports.length,
        brain: fileManifest.brain.length
    });

    // Render Agent Reports (flat structure)
    fileManifest.agentReports.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = file.name;
        a.dataset.path = file.path;
        a.className = 'file-link';
        // Level 0 files: 0 * 16 + 40 = 40px
        a.style.paddingLeft = '40px';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            console.log('File clicked:', file.name, file.path);
            loadFile(getRawUrl(file.path), a);
        });
        li.appendChild(a);
        agentReportsList.appendChild(li);
    });

    // Render Brain files (nested structure)
    const brainTree = buildFileTree(fileManifest.brain);
    renderFileTree(brainList, brainTree);

    console.log('File list rendered');
}

// Setup search functionality
function setupSearch() {
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        filterFiles(searchTerm);
    });
}

// Filter files based on search term
function filterFiles(searchTerm) {
    const allLinks = document.querySelectorAll('.file-link');
    const allFolders = document.querySelectorAll('.folder-item');
    const mainSections = document.querySelectorAll('.main-section');

    if (searchTerm === '') {
        // Show all files and folders
        allLinks.forEach(link => {
            let item = link.closest('.file-item');
            if (item) item.style.display = 'block';
        });
        allFolders.forEach(folder => {
            folder.style.display = 'block';
        });
        mainSections.forEach(section => {
            section.style.display = 'block';
        });
        return;
    }

    // Hide all first
    allLinks.forEach(link => {
        let item = link.closest('.file-item');
        if (item) item.style.display = 'none';
    });
    allFolders.forEach(folder => {
        folder.style.display = 'none';
    });

    // Show matching files and their parent folders
    allLinks.forEach(link => {
        const fileName = link.textContent.toLowerCase();
        if (fileName.includes(searchTerm)) {
            let item = link.closest('.file-item');
            if (item) {
                item.style.display = 'block';
                // Show all parent folders and main sections
                let parent = item.parentElement;
                while (parent) {
                    if (parent.classList.contains('file-list')) {
                        let folderItem = parent.closest('.folder-item');
                        if (folderItem) {
                            folderItem.style.display = 'block';
                            // Expand the folder
                            let ul = folderItem.querySelector('ul');
                            if (ul) ul.style.display = 'block';
                            let toggle = folderItem.querySelector('.folder-toggle');
                            if (toggle) toggle.textContent = '▼';
                            parent = folderItem.parentElement;
                        } else {
                            // Check if it's a main section
                            let mainSection = parent.closest('.main-section');
                            if (mainSection) {
                                mainSection.style.display = 'block';
                                let list = mainSection.querySelector('.file-list');
                                if (list) list.style.display = 'block';
                                let toggle = mainSection.querySelector('.folder-toggle');
                                if (toggle) toggle.textContent = '▼';
                            }
                            break;
                        }
                    } else {
                        parent = parent.parentElement;
                    }
                }
            }
        }
    });

    // Hide main sections that have no visible files
    mainSections.forEach(section => {
        const visibleFiles = section.querySelectorAll('.file-item[style="display: block;"]');
        if (visibleFiles.length === 0) {
            section.style.display = 'none';
        }
    });
}

// Expand all parent folders of an element
function expandParentFolders(element) {
    let parent = element.closest('.file-list');
    while (parent) {
        const folderItem = parent.closest('.folder-item');
        if (folderItem) {
            const ul = folderItem.querySelector('ul');
            if (ul && ul.style.display === 'none') {
                ul.style.display = 'block';
                const toggle = folderItem.querySelector('.folder-toggle');
                if (toggle) toggle.textContent = '▼';
            }
            parent = folderItem.parentElement.closest('.file-list');
        } else {
            // Expand main section if needed
            const mainSection = parent.closest('.main-section');
            if (mainSection) {
                const list = mainSection.querySelector('.file-list');
                if (list && list.style.display === 'none') {
                    list.style.display = 'block';
                    const toggle = mainSection.querySelector('.folder-toggle');
                    if (toggle) toggle.textContent = '▼';
                }
            }
            break;
        }
    }
}

// Load and display markdown file
async function loadFile(filePath, linkElement) {
    const loadingEl = document.getElementById('loading');
    const errorEl = document.getElementById('error');
    const emptyStateEl = document.getElementById('emptyState');
    const markdownContentEl = document.getElementById('markdownContent');

    if (!loadingEl || !markdownContentEl) {
        console.error('Required elements not found');
        return;
    }

    // Update active state
    document.querySelectorAll('.file-link').forEach(a => a.classList.remove('active'));
    if (linkElement) {
        linkElement.classList.add('active');
        // Expand parent folders so the active file is visible
        expandParentFolders(linkElement);
    }

    // Show loading state
    loadingEl.classList.remove('hidden');
    if (errorEl) errorEl.classList.add('hidden');
    if (emptyStateEl) emptyStateEl.classList.add('hidden');
    markdownContentEl.innerHTML = '';

    try {
        console.log('Loading file:', filePath);
        const response = await fetch(filePath);

        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
        }

        const markdown = await response.text();
        console.log('File loaded successfully, length:', markdown.length);

        // Configure marked options
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: true,
            mangle: false
        });

        // Convert markdown to HTML
        const html = marked.parse(markdown);

        // Get file name from path
        let fileName = linkElement ? linkElement.textContent : filePath.split('/').pop();
        // Remove .md extension if present
        if (fileName.endsWith('.md')) {
            fileName = fileName.slice(0, -3);
        }

        // Wrap content in styled container
        const wrapper = document.createElement('div');
        wrapper.className = 'markdown-content-wrapper';

        // Add file name header
        const header = document.createElement('div');
        header.className = 'markdown-header';
        const title = document.createElement('h2');
        title.className = 'markdown-title';
        title.textContent = fileName;
        header.appendChild(title);

        // Add content
        const content = document.createElement('div');
        content.className = 'markdown-body';
        content.innerHTML = html;

        wrapper.appendChild(header);
        wrapper.appendChild(content);

        // Clear and add wrapped content
        const contentEl = document.getElementById('markdownContent');
        contentEl.innerHTML = '';
        contentEl.appendChild(wrapper);

        // Hide loading state
        loadingEl.classList.add('hidden');

        // Scroll to top
        const contentArea = document.querySelector('.content-area');
        if (contentArea) {
            contentArea.scrollTop = 0;
        }

    } catch (error) {
        console.error('Error loading file:', error);
        loadingEl.classList.add('hidden');
        if (errorEl) {
            errorEl.classList.remove('hidden');
            errorEl.textContent = `Error loading file: ${error.message}`;
        }
    }
}

// Handle hash-based navigation (for direct links)
window.addEventListener('hashchange', () => {
    const hash = window.location.hash.slice(1); // Remove #
    if (hash && fileManifest.agentReports.length > 0) {
        // Find file by name in manifest
        const allFiles = [...fileManifest.agentReports, ...fileManifest.brain];
        const file = allFiles.find(f => f.name === hash || f.path.includes(hash));
        if (file) {
            const link = document.querySelector(`a[data-path="${file.path}"]`);
            if (link) {
                loadFile(getRawUrl(file.path), link);
            }
        }
    }
});
