# NoteBook MCP Server

A secure MCP (Model Context Protocol) server that allows reading files from the `mcp-server` directory and writing reports to the `NoteBook` directory.

## Security Features

- **Read Access**: Can only read files within the `mcp-server` directory
- **Write Access**: Can only write files to the `NoteBook` directory
- **Path Validation**: All paths are validated to prevent directory traversal attacks
- **Sandboxed**: Cannot access any files outside of the allowed directories

## Installation

1. Navigate to the mcp-server directory:
```bash
cd mcp-server
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Running the Server

The server runs on stdio and communicates via the MCP protocol:

```bash
node index.js
```

### Configuring in Cursor

Add this to your Cursor MCP settings (usually in `~/.cursor/mcp.json` or similar):

```json
{
  "mcpServers": {
    "notebook": {
      "command": "node",
      "args": ["/home/dheerajnalapat/notebook/mcp-server/index.js"]
    }
  }
}
```

**Note**: Update the path to match your actual installation location.

### Available Tools

1. **list_files** - List all files in the mcp-server directory
   - Parameters:
     - `path` (optional): Relative path from mcp-server directory (default: ".")

2. **read_file** - Read a file from the mcp-server directory
   - Parameters:
     - `path` (required): Relative path to the file from mcp-server directory

3. **write_report** - Write a report file to NoteBook directory
   - Parameters:
     - `filename` (required): Filename for the report
     - `content` (required): Content to write to the report file

4. **get_file_info** - Get information about a file (size, modified time, etc.)
   - Parameters:
     - `path` (required): Relative path to the file from mcp-server directory

## Example Usage

Once configured in Cursor, you can use the MCP server in other projects:

- Ask the agent to write a report: "Write a report to NoteBook about the project status"
- Read files from mcp-server: "Read the config file from mcp-server"
- List available files: "List all files in the mcp-server directory"

## Directory Structure

```
notebook/
├── mcp-server/          # Server code and allowed read directory
│   ├── index.js
│   ├── package.json
│   └── README.md
└── NoteBook/            # Allowed write directory
    └── (reports written here)
```
