// server.js or server.mjs
import dotenv from 'dotenv';
import express from 'express';
import {Octokit} from '@octokit/rest';
import fetch from 'cross-fetch';
import path from 'path';
import {fileURLToPath} from 'url';
import {promises as fs} from 'fs';
// We'll use dynamic import for repomix (renamed to AI analysis in frontend)

// Initialize environment variables
dotenv.config();

// Get the directory name equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Octokit with GitHub token and fetch implementation
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: {
        fetch: fetch
    }
});

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Function to run analysis programmatically using dynamic import
async function runAnalysis(dir, style = 'xml') {
    try {
        console.log(`Running AI analysis in ${dir} with style: ${style}`);
        // Dynamically import repomix
        const { runCli } = await import('repomix');

        // Create a unique filename for output
        const outputFileName = `ai-analysis-${style}-${Date.now()}`;
        const outputPath = path.join(dir, outputFileName);

        // Run analysis with output directly to file
        await runCli([dir], dir, {
            ignore: "**/*.diff",
            style: style,
            output: outputFileName,
        });

        return outputPath;
    } catch (error) {
        console.error('Error running AI analysis:', error);
        throw error;
    }
}

// Format selection endpoint for AI analysis
app.post('/api/run-analysis', async (req, res) => {
    try {
        const { prId, owner, repo, format } = req.body;

        if (!prId || !owner || !repo) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Folder where files are stored
        const prDirName = `${owner}-${repo}-${prId}`;
        const prDir = path.join(__dirname, 'pr-data', prDirName);

        // Check if directory exists
        try {
            await fs.access(prDir);
        } catch (error) {
            return res.status(404).json({ error: 'PR files not found. Please analyze the PR first.' });
        }

        // Run analysis on the folder
        try {
            // Run the analysis and get the output file path
            const outputPath = await runAnalysis(prDir, format);
            const relativePath = path.relative(__dirname, outputPath);

            res.json({
                analysisFilePath: relativePath
            });
        } catch (error) {
            console.error('AI analysis error:', error);
            res.status(500).json({ error: `Failed to run AI analysis: ${error.message}` });
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Server error', details: error.message });
    }
});

// Helper function to get all files in a directory and its subdirectories
async function getAllFiles(dir) {
    const files = await fs.readdir(dir, { withFileTypes: true });
    const result = [];

    for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
            const subDirFiles = await getAllFiles(fullPath);
            result.push(...subDirFiles);
        } else {
            result.push(fullPath);
        }
    }

    return result;
}

app.post('/api/analyze-pr', async (req, res) => {
    try {
        const { prUrl, runAiAnalysis = false, analysisFormat = 'xml' } = req.body;

        if (!prUrl) {
            return res.status(400).json({ error: 'PR URL is required' });
        }

        // Extract PR ID and repo details
        const urlParts = prUrl.match(/github\.com\/([^\/]+)\/([^\/]+)\/pull\/(\d+)/);
        if (!urlParts) {
            return res.status(400).json({ error: 'Invalid GitHub PR URL' });
        }

        const [_, owner, repo, pullNumber] = urlParts;
        const prId = pullNumber;

        // Create a unique directory name for this PR
        const prDirName = `${owner}-${repo}-${prId}`;
        const prDir = path.join(__dirname, 'pr-data', prDirName);

        // Clear and recreate the PR directory
        try {
            await fs.rm(prDir, { recursive: true, force: true });
        } catch (error) {
            // Ignore errors if directory doesn't exist
        }

        await fs.mkdir(prDir, { recursive: true });

        // Get PR details first to get the head SHA
        const prDetails = await getPrDetails(owner, repo, pullNumber);

        // Get diff from PR
        const diff = await getPullRequestDiff(owner, repo, pullNumber);

        // Save diff to file
        const diffFileName = `diff-${prId}.diff`;
        await fs.writeFile(path.join(prDir, diffFileName), diff);

        // Get files changed in PR and download their content
        const changedFiles = await getChangedFiles(owner, repo, pullNumber);
        // Download all the changed files using the PR head ref
        const downloadResults = await downloadChangedFiles(changedFiles, prDir, owner, repo, pullNumber, prDetails.head_sha);

        // Only run AI analysis if requested
        let analysisFilePath = null;

        if (runAiAnalysis) {
            try {
                console.log(`Running AI analysis for PR #${prId} with format ${analysisFormat}`);

                // Run analysis and get the output file path
                const outputPath = await runAnalysis(prDir, analysisFormat);
                analysisFilePath = path.relative(__dirname, outputPath);

                console.log(`AI analysis complete, saved to ${outputPath}`);
            } catch (error) {
                console.error('AI analysis error:', error);
            }
        }

        // Return results with all the data
        res.json({
            prId,
            owner,
            repo,
            diffPath: path.join(prDir, diffFileName),
            totalFiles: changedFiles.length,
            downloadStats: downloadResults,
            prDetails,
            diff: diff,
            changedFiles: changedFiles.map(file => file.filename),
            analysisFilePath
        });

    } catch (error) {
        console.error('Error processing PR:', error);
        res.status(500).json({ error: 'Failed to process PR', details: error.message });
    }
});

// Get changed files function using Octokit with pagination
async function getChangedFiles(owner, repo, pullNumber) {
    try {
        console.log(`Fetching changed files for ${owner}/${repo}#${pullNumber}`);

        let allFiles = [];
        let page = 1;
        const perPage = 100;
        let hasMorePages = true;

        while (hasMorePages) {
            try {
                const response = await octokit.pulls.listFiles({
                    owner,
                    repo,
                    pull_number: parseInt(pullNumber),
                    per_page: perPage,
                    page
                });

                const files = response.data;

                if (files.length === 0) {
                    hasMorePages = false;
                } else {
                    allFiles = allFiles.concat(files);
                    page += 1;

                    if (files.length < perPage) {
                        hasMorePages = false;
                    }

                    console.log(`Retrieved page ${page-1} with ${files.length} files (total: ${allFiles.length})`);
                }

                // Check rate limit and pause if needed
                const rateLimit = response.headers['x-ratelimit-remaining'];
                if (rateLimit && parseInt(rateLimit, 10) < 20) {
                    console.log(`Rate limit low: ${rateLimit} remaining. Waiting...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            } catch (error) {
                // Handle rate limiting
                if (error.status === 403 && error.message.includes('API rate limit exceeded')) {
                    const resetTime = parseInt(error.response.headers['x-ratelimit-reset'], 10) * 1000;
                    const waitTime = resetTime - Date.now();

                    console.warn(`Rate limit exceeded, waiting ${Math.ceil(waitTime/1000)} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime + 1000));

                    // Try this page again
                    continue;
                }

                throw error;
            }
        }

        console.log(`Total files changed in PR: ${allFiles.length}`);
        return allFiles;
    } catch (error) {
        console.error('Error fetching changed files:', error.message);
        throw new Error(`Failed to fetch changed files: ${error.message}`);
    }
}

// Download changed files function using Octokit
async function downloadChangedFiles(files, targetDir, owner, repo, pullNumber, headSha) {
    // Filter files to reduce API calls
    const filesToDownload = files.filter(file => {
        // Skip deleted files and binary/large files
        if (file.status === 'removed') return false;
        if (file.size > 500000) return false; // Skip files > 500KB

        // Skip binary and non-code files based on extension
        const ext = path.extname(file.filename).toLowerCase();
        const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.zip', '.tar', '.gz', '.pdf', '.bin'];
        if (binaryExts.includes(ext)) return false;

        return true;
    });

    console.log(`Filtered to ${filesToDownload.length} files to download (skipped deleted/binary/large files)`);

    // Create a queue of files to download with controlled concurrency
    let concurrencyLimit = 5; // Maximum parallel requests
    let activeRequests = 0;
    let successCount = 0;
    let failCount = 0;

    // Exponential backoff retry function
    async function fetchWithRetry(callback, retries = 3, delay = 1000) {
        try {
            return await callback();
        } catch (error) {
            // If rate limited, wait until reset
            if (error.status === 403 && error.message.includes('API rate limit exceeded')) {
                const resetTime = parseInt(error.response.headers['x-ratelimit-reset'], 10) * 1000;
                const waitTime = resetTime - Date.now();

                console.warn(`Rate limit exceeded, waiting ${Math.ceil(waitTime/1000)} seconds...`);
                await new Promise(resolve => setTimeout(resolve, waitTime + 1000));

                // Retry after waiting
                return fetchWithRetry(callback, retries, delay);
            }

            // For other errors, use exponential backoff
            if (retries > 0) {
                console.warn(`Request failed, retrying in ${delay}ms... (${retries} retries left)`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return fetchWithRetry(callback, retries - 1, delay * 2);
            }

            throw error;
        }
    }

    // Use an array to store active download promises
    const downloadPromises = [];

    // Process the queue until all files are downloaded
    for (const file of filesToDownload) {
        // Wait if we've reached the concurrency limit
        while (activeRequests >= concurrencyLimit) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        activeRequests++;

        // Start the download process for this file
        const downloadPromise = (async () => {
            try {
                // Get the contents of the file from GitHub
                // Make the request with retry capability
                const response = await fetchWithRetry(async () => {
                    return await octokit.repos.getContent({
                        owner,
                        repo,
                        path: file.filename,
                        ref: headSha || `refs/pull/${pullNumber}/head` // Use PR head SHA or pull reference
                    });
                });

                let content;
                if (response.data.content) {
                    // Convert base64 content
                    content = Buffer.from(response.data.content, 'base64');
                } else {
                    throw new Error('No content returned from GitHub API');
                }

                // Ensure directory structure exists
                const filePath = path.join(targetDir, file.filename);
                const fileDir = path.dirname(filePath);
                await fs.mkdir(fileDir, { recursive: true });

                // Write file content
                await fs.writeFile(filePath, content);
                console.log(`Downloaded (${++successCount}/${filesToDownload.length}): ${file.filename}`);
            } catch (error) {
                console.error(`Error downloading ${file.filename}:`, error.message);
                failCount++;
            } finally {
                activeRequests--;
            }
        })();

        // Add to our list of promises
        downloadPromises.push(downloadPromise);
    }

    // Wait for all downloads to complete
    await Promise.all(downloadPromises);

    console.log(`Download complete: ${successCount} files downloaded, ${failCount} failed`);
    return {
        total: filesToDownload.length,
        success: successCount,
        failed: failCount
    };
}

// Get PR details function using Octokit
async function getPrDetails(owner, repo, pullNumber) {
    try {
        console.log(`Fetching PR details for ${owner}/${repo}#${pullNumber}`);

        // Get PR details
        const prResponse = await octokit.pulls.get({
            owner,
            repo,
            pull_number: parseInt(pullNumber)
        });

        const prDetails = {
            title: prResponse.data.title,
            description: prResponse.data.body || '',
            author: prResponse.data.user?.login || 'Unknown',
            created_at: prResponse.data.created_at,
            updated_at: prResponse.data.updated_at,
            state: prResponse.data.state,
            html_url: prResponse.data.html_url,
            head_sha: prResponse.data.head.sha, // Save the head SHA
            issue: null
        };

        // Look for issue references in PR body or in the PR's issue links
        let issueNumber = null;

        // Check for #123 format in PR body
        const bodyIssueMatch = prDetails.description.match(/(?:fixes|closes|resolves|references)\s+#(\d+)/i);
        if (bodyIssueMatch) {
            issueNumber = bodyIssueMatch[1];
        }

        // If no issue found in body, check PR's issue links if available
        if (!issueNumber && prResponse.data.issue_url) {
            const issueUrlMatch = prResponse.data.issue_url.match(/\/issues\/(\d+)$/);
            if (issueUrlMatch) {
                issueNumber = issueUrlMatch[1];
            }
        }

        // If we found an issue reference, fetch its details
        if (issueNumber) {
            try {
                console.log(`Fetching linked issue #${issueNumber}`);
                const issueResponse = await octokit.issues.get({
                    owner,
                    repo,
                    issue_number: parseInt(issueNumber)
                });

                prDetails.issue = {
                    number: issueNumber,
                    title: issueResponse.data.title,
                    body: issueResponse.data.body || '',
                    state: issueResponse.data.state,
                    html_url: issueResponse.data.html_url
                };
            } catch (error) {
                console.error(`Error fetching issue #${issueNumber}:`, error.message);
            }
        }

        return prDetails;
    } catch (error) {
        console.error('Error fetching PR details:', error.message);
        return {
            title: `PR #${pullNumber}`,
            description: 'Failed to fetch PR details'
        };
    }
}

// Get PR diff function using Octokit
async function getPullRequestDiff(owner, repo, pullNumber) {
    try {
        console.log(`Attempting to fetch PR #${pullNumber} diff from ${owner}/${repo}`);

        if (!process.env.GITHUB_TOKEN) {
            throw new Error('GitHub token is missing. Set GITHUB_TOKEN in your environment.');
        }

        try {
            // Get the PR diff using Octokit with the media type for diff format
            const response = await octokit.pulls.get({
                owner,
                repo,
                pull_number: parseInt(pullNumber),
                mediaType: {
                    format: 'diff'
                }
            });

            if (response.data) {
                const diffSize = typeof response.data === 'string' ? response.data.length : 'unknown';
                console.log(`Successfully fetched diff (${diffSize} bytes)`);

                // Add some diagnostics to verify we got a diff
                if (typeof response.data === 'string') {
                    // Look for tell-tale diff markers
                    if (response.data.includes('diff --git')) {
                        console.log('Diff format confirmed - contains git diff markers');
                    } else {
                        console.log('Warning: Response doesn\'t contain expected diff format');
                        console.log('First 100 chars:', response.data.substring(0, 100));
                    }
                }

                return response.data;
            } else {
                throw new Error('Empty response from GitHub API');
            }
        } catch (error) {
            console.error('Error fetching diff:', {
                status: error.status,
                message: error.message
            });

            // Handle specific error cases
            if (error.status === 401) {
                throw new Error('Authentication failed. Check your GitHub token.');
            } else if (error.status === 404) {
                throw new Error('Pull request not found. Verify the PR exists and you have access to it.');
            } else if (error.status === 403) {
                throw new Error('Access forbidden. Your token may need additional permissions.');
            } else if (error.status === 415) {
                throw new Error('Unsupported media type. The server doesn\'t support the diff format request.');
            }

            throw new Error(`Failed to fetch diff: ${error.message}`);
        }
    } catch (error) {
        console.error('Error in getPullRequestDiff:', error.message);
        throw error;
    }
}

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});