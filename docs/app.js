// File manifest - all markdown files in Agent_Reports and Brain folders
const fileManifest = {
    agentReports: [
        { name: 'AGENT_SCRATCHPAD.md', path: '../Agent_Reports/AGENT_SCRATCHPAD.md' },
        { name: 'agent-builder-beta-migration-script-report.md', path: '../Agent_Reports/agent-builder-beta-migration-script-report.md' },
        { name: 'agent-builder-beta-migration-worker-report.md', path: '../Agent_Reports/agent-builder-beta-migration-worker-report.md' }
    ],
    brain: [
        { name: 'Memory/Concepts/README.md', path: '../Brain/Memory/Concepts/README.md' },
        { name: 'Memory/Connections/README.md', path: '../Brain/Memory/Connections/README.md' },
        { name: 'Memory/Skills/README.md', path: '../Brain/Memory/Skills/README.md' },
        { name: 'Thoughts/daily/README.md', path: '../Brain/Thoughts/daily/README.md' },
        { name: 'Thoughts/long-shots/README.md', path: '../Brain/Thoughts/long-shots/README.md' },
        { name: 'Thoughts/scratchpad.md', path: '../Brain/Thoughts/scratchpad.md' }
    ]
};

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    renderFileList();
    setupSearch();
    
    // Load first file by default (optional)
    // loadFile(fileManifest.agentReports[0].path);
});

// Render file lists in sidebar
function renderFileList() {
    const agentReportsList = document.getElementById('agentReportsList');
    const brainList = document.getElementById('brainList');
    
    // Render Agent Reports
    fileManifest.agentReports.forEach(file => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = file.name;
        a.dataset.path = file.path;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            loadFile(file.path, a);
        });
        li.appendChild(a);
        agentReportsList.appendChild(li);
    });
    
    // Render Brain files
    fileManifest.brain.forEach(file => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.href = '#';
        a.textContent = file.name;
        a.dataset.path = file.path;
        a.addEventListener('click', (e) => {
            e.preventDefault();
            loadFile(file.path, a);
        });
        li.appendChild(a);
        brainList.appendChild(li);
    });
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
    const allLinks = document.querySelectorAll('.file-list a');
    allLinks.forEach(link => {
        const fileName = link.textContent.toLowerCase();
        const parent = link.parentElement;
        if (fileName.includes(searchTerm)) {
            parent.style.display = 'block';
        } else {
            parent.style.display = searchTerm === '' ? 'block' : 'none';
        }
    });
}

// Load and display markdown file
async function loadFile(filePath, linkElement) {
    // Update active state
    document.querySelectorAll('.file-list a').forEach(a => a.classList.remove('active'));
    if (linkElement) {
        linkElement.classList.add('active');
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
                loadFile(file.path, link);
            }
        }
    }
});
