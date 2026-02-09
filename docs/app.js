// Auto-discover markdown files using GitHub API
// No manual updates needed - files are discovered automatically when the page loads
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
    loadingEl.textContent = 'Discovering files...';
    loadingEl.classList.remove('hidden');

    try {
        // Fetch files from both folders in parallel
        const [agentReports, brain] = await Promise.all([
            fetchMarkdownFiles('Agent_Reports'),
            fetchMarkdownFiles('Brain')
        ]);

        // Process Agent Reports - remove 'Agent_Reports/' prefix from folder
        fileManifest.agentReports = agentReports.map(file => ({
            name: file.name,
            path: file.path,
            folder: file.folder.replace(/^Agent_Reports\//, '').replace(/^Agent_Reports$/, '')
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

    } catch (error) {
        console.error('Error discovering files:', error);
        loadingEl.classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('error').textContent = `Error discovering files: ${error.message}`;
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

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
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
                a.addEventListener('click', (e) => {
                    e.preventDefault();
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
            folderHeader.appendChild(folderToggle);
            folderHeader.appendChild(folderName);

            const folderContent = document.createElement('ul');
            folderContent.className = 'file-list nested';
            folderContent.style.display = 'none'; // Collapsed by default
            folderContent.style.paddingLeft = `${(level + 1) * 1}rem`;

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

    // Clear existing content
    agentReportsList.innerHTML = '';
    brainList.innerHTML = '';

    // Render Agent Reports (flat structure)
    fileManifest.agentReports.forEach(file => {
        const li = document.createElement('li');
        li.className = 'file-item';
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = file.name;
        a.dataset.path = file.path;
        a.className = 'file-link';
        a.addEventListener('click', (e) => {
            e.preventDefault();
            loadFile(getRawUrl(file.path), a);
        });
        li.appendChild(a);
        agentReportsList.appendChild(li);
    });

    // Render Brain files (nested structure)
    const brainTree = buildFileTree(fileManifest.brain);
    renderFileTree(brainList, brainTree);
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
    // Update active state
    document.querySelectorAll('.file-link').forEach(a => a.classList.remove('active'));
    if (linkElement) {
        linkElement.classList.add('active');
        // Expand parent folders so the active file is visible
        expandParentFolders(linkElement);
    }

    // Show loading state
    document.getElementById('loading').classList.remove('hidden');
    document.getElementById('error').classList.add('hidden');
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('markdownContent').innerHTML = '';

    try {
        const response = await fetch(filePath);

        if (!response.ok) {
            throw new Error(`Failed to load file: ${response.status} ${response.statusText}`);
        }

        const markdown = await response.text();

        // Configure marked options
        marked.setOptions({
            breaks: true,
            gfm: true,
            headerIds: true,
            mangle: false
        });

        // Convert markdown to HTML
        const html = marked.parse(markdown);

        // Display content
        document.getElementById('markdownContent').innerHTML = html;

        // Hide loading state
        document.getElementById('loading').classList.add('hidden');

        // Scroll to top
        document.querySelector('.content-area').scrollTop = 0;

    } catch (error) {
        console.error('Error loading file:', error);
        document.getElementById('loading').classList.add('hidden');
        document.getElementById('error').classList.remove('hidden');
        document.getElementById('error').textContent = `Error loading file: ${error.message}`;
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
