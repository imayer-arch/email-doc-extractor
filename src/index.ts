import { config, validateConfig, setupAdkEnvironment } from './config';
import { createDocumentExtractionAgent, runAgent, processEmailsAutomatically } from './agent';
import { getDatabaseService } from './services/database.service';

/**
 * Main entry point for the Email Document Extractor
 */
async function main(): Promise<void> {
  console.log('========================================');
  console.log('  Email Document Extractor POC');
  console.log('  Using Google ADK + AWS Textract');
  console.log('========================================\n');

  // Validate configuration
  try {
    validateConfig();
    setupAdkEnvironment(); // Setup env vars for ADK
    console.log('✓ Configuration validated successfully\n');
  } catch (error) {
    console.error('✗ Configuration error:', error instanceof Error ? error.message : error);
    console.log('\nPlease ensure all required environment variables are set in .env');
    console.log('See env.example for reference.\n');
    process.exit(1);
  }

  // Get command line arguments
  const args = process.argv.slice(2);
  const command = args[0] || 'process';

  switch (command) {
    case 'process':
      // Run automatic email processing once
      await processEmailsAutomatically();
      break;

    case 'poll':
      // Start polling loop
      await startPollingLoop();
      break;

    case 'interactive':
      // Run in interactive mode
      await runInteractiveMode();
      break;

    case 'stats':
      // Show statistics
      await showStats();
      break;

    case 'help':
    default:
      showHelp();
      break;
  }

  // Cleanup
  const dbService = getDatabaseService();
  await dbService.disconnect();
}

/**
 * Start polling loop for continuous processing
 */
async function startPollingLoop(): Promise<void> {
  console.log(`Starting polling loop (interval: ${config.agent.pollingIntervalMs}ms)...`);
  console.log('Press Ctrl+C to stop\n');

  const processLoop = async () => {
    try {
      console.log(`[${new Date().toISOString()}] Checking for new emails...`);
      await processEmailsAutomatically();
    } catch (error) {
      console.error('Error in processing loop:', error);
    }
  };

  // Initial run
  await processLoop();

  // Set up interval
  const intervalId = setInterval(processLoop, config.agent.pollingIntervalMs);

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    clearInterval(intervalId);
    process.exit(0);
  });

  // Keep the process running
  await new Promise(() => {});
}

/**
 * Run in interactive mode (for testing and development)
 */
async function runInteractiveMode(): Promise<void> {
  const readline = await import('readline');
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('Interactive mode started. Type your commands or "exit" to quit.\n');
  console.log('Example commands:');
  console.log('  - "Check for new emails"');
  console.log('  - "Show extraction statistics"');
  console.log('  - "Process all pending emails"');
  console.log('  - "Show recent documents"\n');

  const prompt = () => {
    rl.question('> ', async (input: string) => {
      const trimmedInput = input.trim();
      
      if (trimmedInput.toLowerCase() === 'exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      if (trimmedInput) {
        try {
          console.log('\nProcessing...\n');
          const result = await runAgent(trimmedInput);
          console.log('\nAgent Response:');
          console.log(result);
          console.log();
        } catch (error) {
          console.error('Error:', error instanceof Error ? error.message : error);
        }
      }

      prompt();
    });
  };

  prompt();
}

/**
 * Show extraction statistics
 */
async function showStats(): Promise<void> {
  const dbService = getDatabaseService();
  
  try {
    const stats = await dbService.getStats();
    
    console.log('Extraction Statistics');
    console.log('--------------------');
    console.log(`Total Documents:     ${stats.total}`);
    console.log(`Completed:           ${stats.completed}`);
    console.log(`Errors:              ${stats.errors}`);
    console.log(`Average Confidence:  ${stats.avgConfidence.toFixed(1)}%`);
    console.log();

    const recentDocs = await dbService.getExtractedDocuments({ limit: 5 });
    
    if (recentDocs.length > 0) {
      console.log('Recent Documents');
      console.log('----------------');
      for (const doc of recentDocs) {
        console.log(`  - ${doc.fileName} (${doc.status}) - ${doc.extractedAt.toLocaleDateString()}`);
      }
    }
  } catch (error) {
    console.error('Error fetching statistics:', error);
  }
}

/**
 * Show help information
 */
function showHelp(): void {
  console.log('Usage: npm run dev [command]\n');
  console.log('Commands:');
  console.log('  process      Process emails once and exit (default)');
  console.log('  poll         Start continuous polling for new emails');
  console.log('  interactive  Run in interactive mode for testing');
  console.log('  stats        Show extraction statistics');
  console.log('  help         Show this help message\n');
  console.log('Environment:');
  console.log('  Make sure to configure .env file with your credentials.');
  console.log('  See env.example for required variables.\n');
}

// Run main function
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
