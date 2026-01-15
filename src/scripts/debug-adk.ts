/**
 * Debug script to test ADK tool execution
 */

import { 
  LlmAgent, 
  FunctionTool, 
  Runner, 
  InMemorySessionService,
  InMemoryArtifactService,
} from '@google/adk';
import { z } from 'zod';
import { config, setupAdkEnvironment } from '../config';

// Setup ADK environment (ensures GOOGLE_GENAI_API_KEY is set)
setupAdkEnvironment();

// Simple test tool
const testTool = new FunctionTool({
  name: 'sayHello',
  description: 'Says hello to a person. Use this tool when asked to greet someone.',
  parameters: z.object({
    name: z.string().describe('The name of the person to greet'),
  }),
  execute: async (params) => {
    console.log(`[TOOL EXECUTED] sayHello called with name: ${params.name}`);
    return { message: `Hello, ${params.name}! Nice to meet you!` };
  },
});

// Another test tool
const addNumbersTool = new FunctionTool({
  name: 'addNumbers',
  description: 'Adds two numbers together. Use this when asked to perform addition.',
  parameters: z.object({
    a: z.number().describe('First number'),
    b: z.number().describe('Second number'),
  }),
  execute: async (params) => {
    console.log(`[TOOL EXECUTED] addNumbers called with a=${params.a}, b=${params.b}`);
    const result = params.a + params.b;
    return { result, calculation: `${params.a} + ${params.b} = ${result}` };
  },
});

async function main() {
  console.log('========================================');
  console.log('  ADK Debug Script');
  console.log('========================================\n');

  console.log('Creating agent with tools...');
  console.log('- sayHello');
  console.log('- addNumbers\n');

  const agent = new LlmAgent({
    name: 'test_agent',
    model: 'gemini-2.0-flash',
    instruction: `You are a helpful assistant with access to tools.
IMPORTANT: You MUST use the available tools to complete tasks.
When asked to greet someone, use the sayHello tool.
When asked to add numbers, use the addNumbers tool.
Do NOT respond without using the appropriate tool first.`,
    tools: [testTool, addNumbersTool],
  });

  console.log('Agent created. Tools registered:', agent.tools?.length || 0);
  console.log('Tools:', agent.tools?.map((t: any) => t.name || t.constructor.name).join(', '));
  console.log();

  const sessionService = new InMemorySessionService();
  const artifactService = new InMemoryArtifactService();

  const runner = new Runner({
    appName: 'adk_debug',
    agent,
    sessionService,
    artifactService,
  });

  const userId = 'test-user';
  const sessionId = `session-${Date.now()}`;

  // Create session
  const session = await runner.sessionService.createSession({
    appName: 'adk_debug',
    userId,
    sessionId,
  });

  console.log('Session created:', session.id);
  console.log();

  // Test 1: Simple greeting
  console.log('=== TEST 1: Greeting ===');
  console.log('Prompt: "Please say hello to Juan"\n');

  const events1 = runner.runAsync({
    userId,
    sessionId: session.id,
    newMessage: {
      role: 'user',
      parts: [{ text: 'Please say hello to Juan' }],
    },
  });

  for await (const event of events1) {
    console.log(`[Event] Author: ${event.author}`);
    console.log(`[Event Full]`, JSON.stringify(event, null, 2).substring(0, 500));
    if (event.content?.parts) {
      console.log(`[Parts count] ${event.content.parts.length}`);
      for (const part of event.content.parts) {
        console.log(`[Part keys] ${Object.keys(part).join(', ')}`);
        if ('text' in part && part.text) {
          console.log(`[Text] ${part.text}`);
        }
        if ('functionCall' in part) {
          const fc = (part as any).functionCall;
          console.log(`[FunctionCall] ${fc.name}(${JSON.stringify(fc.args)})`);
        }
        if ('functionResponse' in part) {
          const fr = (part as any).functionResponse;
          console.log(`[FunctionResponse] ${fr.name}: ${JSON.stringify(fr.response)}`);
        }
      }
    } else {
      console.log(`[No content.parts]`);
    }
  }

  console.log('\n=== TEST 2: Math ===');
  console.log('Prompt: "What is 15 + 27?"\n');

  // Create new session for test 2
  const session2 = await runner.sessionService.createSession({
    appName: 'adk_debug',
    userId,
    sessionId: `session-${Date.now()}-2`,
  });

  const events2 = runner.runAsync({
    userId,
    sessionId: session2.id,
    newMessage: {
      role: 'user',
      parts: [{ text: 'What is 15 + 27? Use the addNumbers tool.' }],
    },
  });

  for await (const event of events2) {
    console.log(`[Event] Author: ${event.author}`);
    if (event.content?.parts) {
      for (const part of event.content.parts) {
        if ('text' in part && part.text) {
          console.log(`[Text] ${part.text}`);
        }
        if ('functionCall' in part) {
          const fc = (part as any).functionCall;
          console.log(`[FunctionCall] ${fc.name}(${JSON.stringify(fc.args)})`);
        }
        if ('functionResponse' in part) {
          const fr = (part as any).functionResponse;
          console.log(`[FunctionResponse] ${fr.name}: ${JSON.stringify(fr.response)}`);
        }
      }
    }
  }

  console.log('\n========================================');
  console.log('  Debug Complete');
  console.log('========================================');
}

main().catch(console.error);
