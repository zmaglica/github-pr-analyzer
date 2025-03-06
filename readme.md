# GitHub PR Analyzer

A tool to analyze GitHub pull requests, fetch changed files, and run repomix analysis on the code.

## Features

- Automatically fetches PR diffs and details
- Downloads all changed files from the PR
- Runs repomix static analysis
- Generates LLM prompts for code review
- Supports different output formats (XML, Markdown, Plain Text)
- Includes file list and copy functionality

## Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file from the example:

```bash
cp .env.example .env
```

4. Add your GitHub token to the `.env` file:

```
GITHUB_TOKEN=your_github_personal_access_token
```

## Usage

1. Start the server:

```bash
npm start
```

2. Open your browser and navigate to `http://localhost:3000`

3. Enter a GitHub PR URL and click "Analyze PR"

4. The app will:
    - Fetch the PR details and diff
    - Download all changed files
    - Run repomix analysis
    - Display the results

5. You can:
    - Change the repomix output format
    - Generate an LLM prompt for code review
    - Copy the diff, PR details, or repomix output

## How It Works

### Backend

- Uses GitHub API to fetch PR diffs and file content
- Creates a unique directory for each PR's files
- Runs repomix analysis on the downloaded files
- Preserves file structure and paths

### Frontend

- Simple UI for entering PR URLs
- Checkboxes for customizing the LLM prompt
- Format selection for repomix output
- File list showing all changed files

## Required GitHub Token Scopes

For the GitHub token, you need at least:
- `repo` scope for accessing private repositories
- `read:user` scope for accessing PR author details

## License

MIT