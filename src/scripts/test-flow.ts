/**
 * Test script to verify the document extraction flow
 * Run with: npx ts-node src/scripts/test-flow.ts
 */

import { config, validateConfig } from '../config';

async function testConfiguration() {
  console.log('=== Testing Configuration ===\n');
  
  try {
    validateConfig();
    console.log('✓ All required environment variables are set\n');
    return true;
  } catch (error) {
    console.log('✗ Configuration validation failed:');
    console.log('  ', (error as Error).message);
    console.log('\n  Please configure the following in your .env file:');
    console.log('  - DATABASE_URL');
    console.log('  - AWS_ACCESS_KEY_ID');
    console.log('  - AWS_SECRET_ACCESS_KEY');
    console.log('  - GMAIL_CLIENT_ID');
    console.log('  - GMAIL_CLIENT_SECRET');
    console.log('  - GMAIL_REFRESH_TOKEN');
    console.log('  - GOOGLE_API_KEY');
    return false;
  }
}

async function testDatabaseConnection() {
  console.log('=== Testing Database Connection ===\n');
  
  try {
    const { getDatabaseService } = await import('../services/database.service');
    const dbService = getDatabaseService();
    
    // Try to get stats (this will test the connection)
    const stats = await dbService.getStats();
    console.log('✓ Database connection successful');
    console.log(`  Total documents: ${stats.total}`);
    console.log(`  Completed: ${stats.completed}`);
    console.log(`  Errors: ${stats.errors}`);
    
    await dbService.disconnect();
    return true;
  } catch (error) {
    console.log('✗ Database connection failed:');
    console.log('  ', (error as Error).message);
    console.log('\n  Make sure PostgreSQL is running and DATABASE_URL is correct.');
    console.log('  Run: npm run db:push to create the database schema.');
    return false;
  }
}

async function testTextractService() {
  console.log('\n=== Testing Textract Service (Mock) ===\n');
  
  try {
    const { getTextractService } = await import('../services/textract.service');
    const textractService = getTextractService();
    
    console.log('✓ Textract service initialized');
    console.log('  Note: Actual Textract calls require valid AWS credentials and documents.\n');
    return true;
  } catch (error) {
    console.log('✗ Textract service initialization failed:');
    console.log('  ', (error as Error).message);
    return false;
  }
}

async function testAgentCreation() {
  console.log('=== Testing Agent Creation ===\n');
  
  try {
    const { createDocumentExtractionAgent } = await import('../agent');
    const agent = createDocumentExtractionAgent();
    
    console.log('✓ Agent created successfully');
    console.log(`  Name: ${agent.name}`);
    console.log(`  Tools: ${agent.tools.length} tools configured`);
    return true;
  } catch (error) {
    console.log('✗ Agent creation failed:');
    console.log('  ', (error as Error).message);
    return false;
  }
}

async function main() {
  console.log('========================================');
  console.log('  Email Document Extractor - Test Suite');
  console.log('========================================\n');

  const results: Record<string, boolean> = {};

  results.config = await testConfiguration();
  
  if (results.config) {
    results.database = await testDatabaseConnection();
    results.textract = await testTextractService();
    results.agent = await testAgentCreation();
  }

  console.log('\n========================================');
  console.log('  Test Summary');
  console.log('========================================\n');

  for (const [test, passed] of Object.entries(results)) {
    console.log(`  ${passed ? '✓' : '✗'} ${test}`);
  }

  const allPassed = Object.values(results).every(r => r);
  
  if (allPassed) {
    console.log('\n✓ All tests passed! The system is ready to use.\n');
    console.log('Next steps:');
    console.log('  1. Configure your Gmail OAuth credentials');
    console.log('  2. Run: npm run dev -- process');
    console.log('  3. Or run: npm run dev -- interactive');
  } else {
    console.log('\n✗ Some tests failed. Please fix the issues above.\n');
  }

  process.exit(allPassed ? 0 : 1);
}

main().catch(console.error);
