#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import { join, resolve, relative, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define allowed directories
const SERVER_DIR = resolve(__dirname);
const AGENT_REPORTS_DIR = resolve(__dirname, "..", "Agent_Reports");

// Security: Validate that a path is within the allowed directory
function isPathAllowed(filePath, allowedDir) {
    const resolvedPath = resolve(filePath);
    const resolvedAllowed = resolve(allowedDir);
    const relativePath = relative(resolvedAllowed, resolvedPath);

    // Check if the path is within the allowed directory
    // relative() returns paths starting with ".." if outside, or paths without ".." if inside
    return !relativePath.startsWith("..") && !relativePath.startsWith("/");
}

// Security: Validate read path (only within server directory)
function validateReadPath(filePath) {
    if (!isPathAllowed(filePath, SERVER_DIR)) {
        throw new Error(
            `Access denied: Cannot read files outside of ${SERVER_DIR}`
        );
    }
    return resolve(SERVER_DIR, relative(SERVER_DIR, resolve(filePath)));
}

// Security: Validate write path (only within Agent_Reports)
function validateWritePath(filePath) {
    if (!isPathAllowed(filePath, AGENT_REPORTS_DIR)) {
        throw new Error(
            `Access denied: Cannot write files outside of ${AGENT_REPORTS_DIR}`
        );
    }
    return resolve(AGENT_REPORTS_DIR, relative(AGENT_REPORTS_DIR, resolve(filePath)));
}

class AgentReportsServer {
    constructor() {
        this.server = new Server(
            {
                name: "agent-reports-mcp-server",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            }
        );

        this.setupHandlers();
        this.transport = new StdioServerTransport();
    }

    setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: [
                {
                    name: "list_files",
                    description:
                        "List all files in the mcp-server directory. Can only read files within the mcp-server folder.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description:
                                    "Relative path from mcp-server directory. Use '.' for root or a subdirectory path.",
                                default: ".",
                            },
                        },
                    },
                },
                {
                    name: "read_file",
                    description:
                        "Read a file from the mcp-server directory. Can only read files within the mcp-server folder.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description:
                                    "Relative path to the file from mcp-server directory.",
                            },
                        },
                        required: ["path"],
                    },
                },
                {
                    name: "write_report",
                    description:
                        "Write a report file to the Agent_Reports directory. Can only write to Agent_Reports folder.",
                    inputSchema: {
                        type: "object",
                        properties: {
                            filename: {
                                type: "string",
                                description:
                                    "Filename for the report (will be written to Agent_Reports directory).",
                            },
                            content: {
                                type: "string",
                                description: "Content to write to the report file.",
                            },
                        },
                        required: ["filename", "content"],
                    },
                },
                {
                    name: "get_file_info",
                    description:
                        "Get information about a file in the mcp-server directory (size, modified time, etc.).",
                    inputSchema: {
                        type: "object",
                        properties: {
                            path: {
                                type: "string",
                                description:
                                    "Relative path to the file from mcp-server directory.",
                            },
                        },
                        required: ["path"],
                    },
                },
            ],
        }));

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;

            try {
                switch (name) {
                    case "list_files": {
                        const listPath = args?.path || ".";
                        const validatedPath = validateReadPath(
                            join(SERVER_DIR, listPath)
                        );
                        const entries = await readdir(validatedPath, {
                            withFileTypes: true,
                        });

                        const files = await Promise.all(
                            entries.map(async (entry) => {
                                const fullPath = join(validatedPath, entry.name);
                                const stats = await stat(fullPath);
                                return {
                                    name: entry.name,
                                    type: entry.isDirectory() ? "directory" : "file",
                                    size: stats.size,
                                    modified: stats.mtime.toISOString(),
                                };
                            })
                        );

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(files, null, 2),
                                },
                            ],
                        };
                    }

                    case "read_file": {
                        if (!args?.path) {
                            throw new Error("Path parameter is required");
                        }
                        const validatedPath = validateReadPath(
                            join(SERVER_DIR, args.path)
                        );
                        const content = await readFile(validatedPath, "utf-8");

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: content,
                                },
                            ],
                        };
                    }

                    case "write_report": {
                        if (!args?.filename || !args?.content) {
                            throw new Error("Filename and content parameters are required");
                        }
                        const validatedPath = validateWritePath(
                            join(AGENT_REPORTS_DIR, args.filename)
                        );
                        await writeFile(validatedPath, args.content, "utf-8");

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Successfully wrote report to ${args.filename}`,
                                },
                            ],
                        };
                    }

                    case "get_file_info": {
                        if (!args?.path) {
                            throw new Error("Path parameter is required");
                        }
                        const validatedPath = validateReadPath(
                            join(SERVER_DIR, args.path)
                        );
                        const stats = await stat(validatedPath);

                        return {
                            content: [
                                {
                                    type: "text",
                                    text: JSON.stringify(
                                        {
                                            path: args.path,
                                            size: stats.size,
                                            modified: stats.mtime.toISOString(),
                                            created: stats.birthtime.toISOString(),
                                            isDirectory: stats.isDirectory(),
                                            isFile: stats.isFile(),
                                        },
                                        null,
                                        2
                                    ),
                                },
                            ],
                        };
                    }

                    default:
                        throw new Error(`Unknown tool: ${name}`);
                }
            } catch (error) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    async run() {
        await this.server.connect(this.transport);
        console.error("Agent Reports MCP server running on stdio");
    }
}

const server = new AgentReportsServer();
server.run().catch(console.error);
