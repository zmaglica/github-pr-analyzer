// public/script.js
document.addEventListener('DOMContentLoaded', () => {
    const prForm = document.getElementById('prForm');
    const prUrlInput = document.getElementById('prUrl');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const loading = document.getElementById('loading');
    const results = document.getElementById('results');
    const prIdBadge = document.getElementById('prIdBadge');
    const repoBadge = document.getElementById('repoBadge');
    const fileCount = document.getElementById('fileCount');
    const changedFilesList = document.getElementById('changedFilesList');

    // AI Analysis elements
    const runAiAnalysis = document.getElementById('runAiAnalysis');
    const aiAnalysisFormat = document.getElementById('aiAnalysisFormat');
    const analysisFileLocation = document.getElementById('analysisFileLocation');

    // PR details elements
    const prTitle = document.getElementById('prTitle');
    const prDescription = document.getElementById('prDescription');
    const issueSection = document.getElementById('issueSection');
    const issueNumber = document.getElementById('issueNumber');
    const issueDescription = document.getElementById('issueDescription');
    const diffContent = document.getElementById('diffContent');

    // Buttons
    const copyPrDescBtn = document.getElementById('copyPrDescBtn');
    const copyIssueBtn = document.getElementById('copyIssueBtn');
    const copyDiffBtn = document.getElementById('copyDiffBtn');
    const generatePromptBtn = document.getElementById('generatePromptBtn');
    const copyPromptBtn = document.getElementById('copyPromptBtn');

    // Checkboxes
    const includePrDescription = document.getElementById('includePrDescription');
    const includeIssue = document.getElementById('includeIssue');
    const includeDiff = document.getElementById('includeDiff');
    const truncateDiff = document.getElementById('truncateDiff');

    // Store the current PR data
    let currentPrData = null;

    // Update message when checkbox is clicked
    if (runAiAnalysis && analysisFileLocation) {
        runAiAnalysis.addEventListener('change', function() {
            if (this.checked) {
                analysisFileLocation.textContent = 'AI-friendly files will be generated when you submit the form.';
            } else {
                analysisFileLocation.textContent = 'No analysis generated yet. Check "Generate AI-friendly files analysis" when analyzing a PR to create AI-friendly files.';
            }
        });
    }

    // Handle form submission
    prForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const prUrl = prUrlInput.value.trim();
        const shouldRunAnalysis = runAiAnalysis && runAiAnalysis.checked;
        const format = aiAnalysisFormat ? aiAnalysisFormat.value : "xml";

        if (!prUrl) {
            showNotification('Please enter a valid GitHub PR URL', 'error');
            return;
        }

        // Show loading
        analyzeBtn.disabled = true;
        loading.classList.remove('hidden');
        results.classList.add('hidden');

        try {
            const response = await fetch('/api/analyze-pr', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    prUrl,
                    runAiAnalysis: shouldRunAnalysis,
                    analysisFormat: format
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to analyze PR');
            }

            // Store current data for later use
            currentPrData = data;

            // Update PR details
            prTitle.textContent = data.prDetails.title || 'No title available';
            prDescription.textContent = data.prDetails.description || 'No description available';

            // Update issue section if available
            if (data.prDetails.issue) {
                issueNumber.textContent = `#${data.prDetails.issue.number}`;
                issueDescription.textContent = data.prDetails.issue.body || 'No issue description available';
                issueSection.classList.remove('hidden');
            } else {
                issueSection.classList.add('hidden');
            }

            // Update diff content
            diffContent.textContent = data.diff || 'No diff available';

            // Update changed files list
            updateChangedFilesList(data.changedFiles);

            // Update basic results
            prIdBadge.textContent = `PR #${data.prId}`;
            repoBadge.textContent = `${data.owner}/${data.repo}`;
            fileCount.textContent = data.totalFiles;

            // Update AI analysis section
            if (analysisFileLocation) {
                if (data.analysisFilePath) {
                    analysisFileLocation.textContent = `AI-friendly files generated at: ${data.analysisFilePath}`;
                } else {
                    analysisFileLocation.textContent = 'No analysis files were generated. Check "Generate AI-friendly files analysis" to create them.';
                }
            }

            // Show results
            results.classList.remove('hidden');

            showNotification('PR analysis completed successfully', 'success');
        } catch (error) {
            console.error('Error:', error);
            showNotification(error.message, 'error');
        } finally {
            // Hide loading
            loading.classList.add('hidden');
            analyzeBtn.disabled = false;
        }
    });

    // Update the list of changed files
    function updateChangedFilesList(files) {
        if (!changedFilesList) return;

        if (!files || files.length === 0) {
            changedFilesList.innerHTML = '<li>No files changed</li>';
            return;
        }

        changedFilesList.innerHTML = '';
        files.forEach(file => {
            const li = document.createElement('li');
            li.textContent = file;
            li.title = file;
            changedFilesList.appendChild(li);
        });
    }

    // Copy buttons event listeners
    if (copyPrDescBtn) {
        copyPrDescBtn.addEventListener('click', () => {
            copyToClipboard(prDescription.textContent);
            showNotification('PR description copied to clipboard', 'success');
        });
    }

    if (copyIssueBtn) {
        copyIssueBtn.addEventListener('click', () => {
            copyToClipboard(issueDescription.textContent);
            showNotification('Issue description copied to clipboard', 'success');
        });
    }

    if (copyDiffBtn) {
        copyDiffBtn.addEventListener('click', () => {
            copyToClipboard(diffContent.textContent);
            showNotification('Diff copied to clipboard', 'success');
        });
    }

    // Generate LLM Prompt
    if (generatePromptBtn) {
        generatePromptBtn.addEventListener('click', () => {
            if (!currentPrData) {
                showNotification('No PR data available', 'error');
                return;
            }

            const includePrDescriptionValue = includePrDescription ? includePrDescription.checked : true;
            const includeIssueValue = includeIssue ? includeIssue.checked : true;
            const includeDiffValue = includeDiff ? includeDiff.checked : true;
            const truncateDiffValue = truncateDiff ? truncateDiff.checked : true;

            const prompt = generateLlmPrompt(
                currentPrData,
                includePrDescriptionValue,
                includeIssueValue,
                includeDiffValue,
                truncateDiffValue
            );

            const generatedPromptElement = document.getElementById('generatedPrompt');
            if (generatedPromptElement) {
                generatedPromptElement.textContent = prompt;
                showNotification('LLM prompt generated', 'success');
            }
        });
    }

    // Copy prompt button
    if (copyPromptBtn) {
        copyPromptBtn.addEventListener('click', () => {
            const generatedPrompt = document.getElementById('generatedPrompt');
            if (generatedPrompt) {
                copyToClipboard(generatedPrompt.textContent);
                showNotification('LLM prompt copied to clipboard', 'success');
            }
        });
    }

    // Helper function to copy text to clipboard
    function copyToClipboard(text) {
        if (!text) {
            showNotification('Nothing to copy', 'error');
            return;
        }

        navigator.clipboard.writeText(text).then(() => {
            // Success - don't need to do anything, notification shown by caller
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showNotification('Failed to copy to clipboard', 'error');
        });
    }

    // Function to generate LLM prompt
    function generateLlmPrompt(data, includePrDesc, includeIssueDetails, includeDiffContent, truncateDiff) {
        let prompt = `I need your help reviewing a GitHub pull request. Please analyze the following code changes and provide feedback.\n\n`;

        prompt += `## Pull Request Details\n`;
        prompt += `Title: ${data.prDetails.title}\n`;
        prompt += `Repository: ${data.owner}/${data.repo}\n`;
        prompt += `PR #${data.prId}\n`;
        prompt += `Files changed: ${data.totalFiles}\n\n`;

        if (includePrDesc && data.prDetails.description) {
            prompt += `## PR Description\n${data.prDetails.description}\n\n`;
        }

        if (includeIssueDetails && data.prDetails.issue) {
            prompt += `## Related Issue #${data.prDetails.issue.number}\n`;
            prompt += `Issue Title: ${data.prDetails.issue.title}\n`;

            if (data.prDetails.issue.body) {
                prompt += `Issue Description:\n${data.prDetails.issue.body}\n\n`;
            }
        }

        if (includeDiffContent && data.diff) {
            let diffText = data.diff;
            let diffTruncated = false;

            // Only truncate if the option is selected
            if (truncateDiff) {
                const maxDiffLength = 8000;

                if (diffText.length > maxDiffLength) {
                    // Find a suitable breaking point (end of a file diff)
                    const breakPoint = diffText.lastIndexOf('\ndiff --git', maxDiffLength);

                    if (breakPoint > 0) {
                        diffText = diffText.substring(0, breakPoint);
                    } else {
                        diffText = diffText.substring(0, maxDiffLength);
                    }

                    diffTruncated = true;
                }
            }

            prompt += `## Code Changes (Diff)\n\`\`\`diff\n${diffText}\n\`\`\`\n\n`;

            if (diffTruncated) {
                prompt += `Note: The diff has been truncated due to length. Focus on analyzing the shown portions.\n\n`;
            }
        }

        // AI analysis is not included in the prompt to avoid large content
        if (data.analysisFilePath) {
            prompt += `## AI Analysis\n`;
            prompt += `AI-friendly files analysis has been generated and saved to: ${data.analysisFilePath}\n\n`;
        }

        prompt += `## Requested Analysis\n`;
        prompt += `1. Review the code for potential bugs, performance issues, or security vulnerabilities\n`;
        prompt += `2. Evaluate code quality, readability, and adherence to best practices\n`;
        prompt += `3. Suggest improvements or alternative approaches\n`;
        prompt += `4. Check if the implementation properly addresses the associated issue (if included)\n`;

        if (data.analysisFilePath) {
            prompt += `5. The AI analysis has been generated separately due to its size\n`;
        }

        prompt += `\nPlease format your review in a clear, structured way with specific recommendations.`;

        return prompt;
    }

    // Helper function to show notifications
    function showNotification(message, type = 'info') {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;

        // Add icon based on notification type
        let icon = 'info-circle';
        if (type === 'success') icon = 'check-circle';
        if (type === 'error') icon = 'exclamation-circle';

        notification.innerHTML = `
      <i class="fas fa-${icon}"></i>
      <span>${message}</span>
    `;

        // Add to document
        document.body.appendChild(notification);

        // Add animation classes
        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        // Remove after delay
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 5000);
    }

    // Add notification styles dynamically
    const style = document.createElement('style');
    style.textContent = `
    .notification {
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 20px;
      background-color: #f6f8fa;
      color: #24292e;
      border-left: 4px solid #0366d6;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      transform: translateX(120%);
      transition: transform 0.3s ease;
      z-index: 1000;
    }
    
    .notification.show {
      transform: translateX(0);
    }
    
    .notification i {
      margin-right: 10px;
      font-size: 16px;
    }
    
    .notification.success {
      border-left-color: #2ea44f;
    }
    
    .notification.success i {
      color: #2ea44f;
    }
    
    .notification.error {
      border-left-color: #d73a49;
    }
    
    .notification.error i {
      color: #d73a49;
    }
  `;
    document.head.appendChild(style);
});