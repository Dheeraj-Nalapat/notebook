// File manifest - all markdown files in Agent_Reports and Brain folders
// Using GitHub raw content API since GitHub Pages only serves files from /docs folder
const REPO_OWNER = 'dheeraj-nalapat';
const REPO_NAME = 'notebook';
const BRANCH = 'main'; // Change this if your default branch is different (e.g., 'master')

const getRawUrl = (filePath) => {
    return `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}/${filePath}`;
};

// File manifest with folder structure preserved
const fileManifest = {
    agentReports: [
        { name: 'AGENT_SCRATCHPAD.md', path: 'Agent_Reports/AGENT_SCRATCHPAD.md', folder: '' },
        { name: 'agent-builder-beta-migration-script-report.md', path: 'Agent_Reports/agent-builder-beta-migration-script-report.md', folder: '' },
        { name: 'agent-builder-beta-migration-worker-report.md', path: 'Agent_Reports/agent-builder-beta-migration-worker-report.md', folder: '' }
    ],
    brain: [
        { name: 'README.md', path: 'Brain/Memory/Concepts/README.md', folder: 'Memory/Concepts' },
        { name: 'README.md', path: 'Brain/Memory/Connections/README.md', folder: 'Memory/Connections' },
        { name: 'README.md', path: 'Brain/Memory/Skills/README.md', folder: 'Memory/Skills' },
        { name: 'README.md', path: 'Brain/Thoughts/daily/README.md', folder: 'Thoughts/daily' },
        { name: 'README.md', path: 'Brain/Thoughts/long-shots/README.md', folder: 'Thoughts/long-shots' },
        { name: 'scratchpad.md', path: 'Brain/Thoughts/scratchpad.md', folder: 'Thoughts' }
    ]
};

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
    renderFileList();
    setupSearch();

    // Load first file by default (optional)
    // loadFile(fileManifest.agentReports[0].path);
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

    if (searchTerm === '') {
        // Show all files and folders
        allLinks.forEach(link => {
            let item = link.closest('.file-item');
            if (item) item.style.display = 'block';
        });
        allFolders.forEach(folder => {
            folder.style.display = 'block';
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
                // Show all parent folders
                let parent = item.parentElement;
                while (parent && parent.classList.contains('file-list')) {
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
                        break;
                    }
                }
            }
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
    if (hash) {
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
