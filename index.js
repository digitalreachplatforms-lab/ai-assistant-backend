/**
 * Complete AI Assistant Backend v3.0
 * Integrated system with:
 * - Multi-model AI (OpenAI, Anthropic, Gemini)
 * - Voice (ElevenLabs + Free TTS fallback)
 * - Calendar management with Google Calendar
 * - Knowledge base
 * - Memory & learning
 * - Automation (Puppeteer)
 * - Budget management with failovers
 */

import express from 'express';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import dotenv from 'dotenv';

// Import all services
import { MultiModelAIService } from './services/multi-model-ai-service.js';
import { CalendarService } from './services/calendar-service.js';
import { ReminderService } from './services/reminder-service.js';
import { PriorityAssessmentService } from './services/priority-assessment-service.js';
import { CalendarConversationFlow } from './services/calendar-conversation-flow.js';
import { BudgetManagerService } from './services/budget-manager-service.js';

// Import from advanced features (v2.0)
import KnowledgeBaseService from '../advanced-features/services/knowledge-base-service.js';
import MemoryLearningService from '../advanced-features/services/memory-learning-service.js';
import AutomationService from '../advanced-features/services/automation-service.js';
import ConversationFlowService from '../advanced-features/services/conversation-flow-service.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ═══════════════════════════════════════════════════════════
// SERVICE INITIALIZATION
// ═══════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  AI ASSISTANT BACKEND v3.0 - INITIALIZING');
console.log('═══════════════════════════════════════════════════════════\n');

// Budget Manager (initialize first to track all usage)
const budgetManager = new BudgetManagerService({
  openaiMonthlyLimit: parseFloat(process.env.OPENAI_MONTHLY_LIMIT) || 100,
  anthropicMonthlyLimit: parseFloat(process.env.ANTHROPIC_MONTHLY_LIMIT) || 50,
  geminiMonthlyLimit: parseFloat(process.env.GEMINI_MONTHLY_LIMIT) || 25,
  elevenlabsMonthlyLimit: parseFloat(process.env.ELEVENLABS_MONTHLY_LIMIT) || 50,
  totalMonthlyLimit: parseFloat(process.env.TOTAL_MONTHLY_LIMIT) || 200
});

// Multi-Model AI
const multiModelAI = new MultiModelAIService({
  openaiApiKey: process.env.OPENAI_API_KEY,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  geminiApiKey: process.env.GEMINI_API_KEY
});

// Calendar Services
const calendarService = new CalendarService();
const reminderService = new ReminderService(calendarService);
const priorityAssessment = new PriorityAssessmentService(multiModelAI);
const calendarFlow = new CalendarConversationFlow(calendarService, priorityAssessment, multiModelAI);

// Advanced Services (v2.0)
const knowledgeBase = new KnowledgeBaseService(multiModelAI);
const memoryLearning = new MemoryLearningService();
const automationService = new AutomationService();
const conversationFlow = new ConversationFlowService(multiModelAI);

// Start reminder service
reminderService.start();

console.log('\n✅ All services initialized\n');

// ═══════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════════

const wss = new WebSocketServer({ noServer: true });

// Connected clients
const clients = new Map(); // clientId -> { ws, playerId, type }

wss.on('connection', (ws, request) => {
  const clientId = generateClientId();
  
  clients.set(clientId, {
    ws,
    playerId: null,
    type: 'unreal', // or 'web'
    connectedAt: new Date().toISOString()
  });

  console.log(`[WebSocket] ✅ Client connected: ${clientId}`);

  // Send connection confirmation
  ws.send(JSON.stringify({
    type: 'connected',
    clientId,
    message: 'Connected to AI Assistant Backend v3.0',
    timestamp: new Date().toISOString(),
    serverVersion: '3.0.0',
    features: [
      'multi_model_ai',
      'voice',
      'calendar',
      'knowledge_base',
      'memory_learning',
      'automation',
      'budget_management'
    ]
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleWebSocketMessage(clientId, message);
    } catch (error) {
      console.error('[WebSocket] ❌ Error handling message:', error.message);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] ❌ Client disconnected: ${clientId}`);
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] ❌ Error for client ${clientId}:`, error.message);
  });
});

// ═══════════════════════════════════════════════════════════
// MESSAGE HANDLING
// ═══════════════════════════════════════════════════════════

async function handleWebSocketMessage(clientId, message) {
  const client = clients.get(clientId);
  
  if (!client) {
    console.error(`[WebSocket] Client not found: ${clientId}`);
    return;
  }

  console.log(`[WebSocket] 📨 Message from ${clientId}:`, message.type);

  switch (message.type) {
    case 'register':
      await handleRegister(clientId, message);
      break;

    case 'chat':
      await handleChat(clientId, message);
      break;

    case 'voice_transcription':
      await handleVoiceTranscription(clientId, message);
      break;

    case 'calendar_create':
      await handleCalendarCreate(clientId, message);
      break;

    case 'calendar_list':
      await handleCalendarList(clientId, message);
      break;

    case 'automation_task':
      await handleAutomationTask(clientId, message);
      break;

    case 'knowledge_query':
      await handleKnowledgeQuery(clientId, message);
      break;

    default:
      sendToClient(clientId, {
        type: 'error',
        error: `Unknown message type: ${message.type}`
      });
  }
}

// ═══════════════════════════════════════════════════════════
// HANDLERS
// ═══════════════════════════════════════════════════════════

async function handleRegister(clientId, message) {
  const client = clients.get(clientId);
  client.playerId = message.playerId;
  client.type = message.clientType || 'unreal';

  console.log(`[WebSocket] ✅ Registered: ${clientId} as ${client.playerId}`);

  sendToClient(clientId, {
    type: 'registered',
    playerId: client.playerId,
    message: 'Registration successful'
  });
}

async function handleChat(clientId, message) {
  const client = clients.get(clientId);
  const playerId = client.playerId;

  console.log(`[Chat] 💬 Message from ${playerId}: ${message.message}`);

  // Check for active conversation flow
  const activeConversation = calendarFlow.getConversation(playerId) || 
                            conversationFlow.getConversation(playerId);

  if (activeConversation) {
    // Continue existing conversation
    let response;
    
    if (activeConversation.flowType.startsWith('calendar') || activeConversation.flowType === 'event_creation' || activeConversation.flowType === 'post_event_assessment') {
      if (activeConversation.flowType === 'event_creation') {
        response = await calendarFlow.continueEventCreation(playerId, message.message);
      } else {
        response = await calendarFlow.continuePostEventAssessment(playerId, message.message);
      }
    } else {
      response = await conversationFlow.continueConversation(playerId, message.message);
    }

    sendToClient(clientId, {
      type: 'chat_response',
      message: response.message,
      expectingInput: response.expectingInput,
      step: response.step
    });

    return;
  }

  // Check for calendar-related intents
  const lowerMessage = message.message.toLowerCase();
  
  if (lowerMessage.includes('schedule') || lowerMessage.includes('appointment') || lowerMessage.includes('calendar')) {
    const response = await calendarFlow.startEventCreation(playerId, message.message);
    
    sendToClient(clientId, {
      type: 'chat_response',
      message: response.message,
      expectingInput: response.expectingInput,
      step: response.step
    });

    return;
  }

  // Check for automation intents
  if (lowerMessage.includes('create folder') || lowerMessage.includes('cancel subscription') || lowerMessage.includes('order refill')) {
    const response = await conversationFlow.startAutomationFlow(playerId, message.message);
    
    sendToClient(clientId, {
      type: 'chat_response',
      message: response.message,
      expectingInput: response.expectingInput
    });

    return;
  }

  // Regular chat with AI
  const conversationHistory = memoryLearning.getConversationHistory(playerId);
  const relevantKnowledge = await knowledgeBase.query(playerId, message.message);

  // Build context
  const messages = [
    {
      role: 'system',
      content: `You are Joevis, an intelligent AI assistant integrated into an Unreal Engine game. You can help with scheduling, automation tasks, answering questions, and controlling the game character.

Available capabilities:
- Schedule calendar events
- Set reminders
- Automate web tasks (Google Drive, subscriptions, etc.)
- Answer questions using knowledge base
- Control game character (jump, wave, etc.)

${relevantKnowledge.length > 0 ? `\nRelevant knowledge:\n${relevantKnowledge.map(k => k.content).join('\n')}` : ''}`
    },
    ...conversationHistory.slice(-10).map(h => ({
      role: h.role,
      content: h.content
    })),
    {
      role: 'user',
      content: message.message
    }
  ];

  // Get recommended AI service
  const recommendedService = budgetManager.getRecommendedService('ai');
  
  if (!recommendedService) {
    sendToClient(clientId, {
      type: 'error',
      message: '⚠️ All AI services are currently unavailable due to budget limits. Please check back later.'
    });
    return;
  }

  // Generate response
  const result = await multiModelAI.generateCompletion(messages, {
    temperature: 0.7,
    maxTokens: 500,
    preferredModel: recommendedService,
    taskType: 'conversation'
  });

  // Track usage
  await budgetManager.trackAIUsage(result.model, result.tokens, result.cost, result.success);

  if (result.success) {
    // Store in memory
    memoryLearning.addConversation(playerId, 'user', message.message);
    memoryLearning.addConversation(playerId, 'assistant', result.content);

    // Store in knowledge base if important
    if (message.message.toLowerCase().includes('remember') || message.message.toLowerCase().includes('important')) {
      await knowledgeBase.store(playerId, message.message, { type: 'user_note' });
    }

    sendToClient(clientId, {
      type: 'chat_response',
      message: result.content,
      model: result.model,
      cost: result.cost
    });
  } else {
    sendToClient(clientId, {
      type: 'error',
      message: '❌ Failed to generate response. All AI models unavailable.'
    });
  }
}

async function handleVoiceTranscription(clientId, message) {
  // Voice transcription with Whisper
  // (Implementation from v2.0)
  console.log(`[Voice] 🎤 Transcription request from ${clientId}`);
  
  sendToClient(clientId, {
    type: 'voice_transcription_result',
    text: 'Voice transcription not yet implemented in integration',
    timestamp: new Date().toISOString()
  });
}

async function handleCalendarCreate(clientId, message) {
  const client = clients.get(clientId);
  const playerId = client.playerId;

  const response = await calendarFlow.startEventCreation(playerId, message.message);
  
  sendToClient(clientId, {
    type: 'calendar_response',
    message: response.message,
    expectingInput: response.expectingInput,
    step: response.step
  });
}

async function handleCalendarList(clientId, message) {
  const client = clients.get(clientId);
  const playerId = client.playerId;

  const events = calendarService.getEvents(playerId, message.startDate, message.endDate);

  sendToClient(clientId, {
    type: 'calendar_list',
    events,
    count: events.length
  });
}

async function handleAutomationTask(clientId, message) {
  const client = clients.get(clientId);
  const playerId = client.playerId;

  const response = await conversationFlow.startAutomationFlow(playerId, message.task);
  
  sendToClient(clientId, {
    type: 'automation_response',
    message: response.message,
    expectingInput: response.expectingInput
  });
}

async function handleKnowledgeQuery(clientId, message) {
  const client = clients.get(clientId);
  const playerId = client.playerId;

  const results = await knowledgeBase.query(playerId, message.query);

  sendToClient(clientId, {
    type: 'knowledge_results',
    results,
    count: results.length
  });
}

// ═══════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════

function sendToClient(clientId, data) {
  const client = clients.get(clientId);
  
  if (client && client.ws.readyState === 1) { // OPEN
    client.ws.send(JSON.stringify({
      ...data,
      timestamp: data.timestamp || new Date().toISOString()
    }));
  }
}

function generateClientId() {
  return `client_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// ═══════════════════════════════════════════════════════════
// BUDGET NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

budgetManager.onNotification(async (notification) => {
  console.log(`[Budget] 📊 ${notification.type}:`, notification.message);

  // Send notification to all connected clients
  for (const [clientId, client] of clients.entries()) {
    sendToClient(clientId, {
      type: 'budget_notification',
      notification
    });
  }
});

// ═══════════════════════════════════════════════════════════
// REMINDER NOTIFICATIONS
// ═══════════════════════════════════════════════════════════

// Set up reminder callback
const reminderCallback = async (playerId, notification) => {
  console.log(`[Reminder] 🔔 Sending to ${playerId}:`, notification.message);

  // Find client by playerId
  for (const [clientId, client] of clients.entries()) {
    if (client.playerId === playerId) {
      sendToClient(clientId, notification);
      
      // If post-event assessment, start conversation flow
      if (notification.type === 'post_event_assessment') {
        const event = notification.event;
        await calendarFlow.startPostEventAssessment(playerId, event);
      }
    }
  }
};

// Schedule reminders for all events
const scheduleAllReminders = () => {
  for (const [playerId, events] of calendarService.events.entries()) {
    for (const event of events) {
      if (event.status === 'scheduled') {
        reminderService.scheduleReminders(event, reminderCallback);
      }
    }
  }
};

scheduleAllReminders();

// ═══════════════════════════════════════════════════════════
// REST API ENDPOINTS
// ═══════════════════════════════════════════════════════════

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    services: {
      multiModelAI: 'active',
      calendar: 'active',
      reminders: 'active',
      knowledgeBase: 'active',
      memoryLearning: 'active',
      automation: 'active',
      budgetManager: 'active'
    }
  });
});

app.get('/stats', (req, res) => {
  res.json({
    budget: budgetManager.getStats(),
    ai: multiModelAI.getStats(),
    calendar: calendarService.getStats(),
    reminders: reminderService.getStats(),
    timestamp: new Date().toISOString()
  });
});

app.get('/budget/report', (req, res) => {
  res.type('text/plain');
  res.send(budgetManager.getReport());
});

// ═══════════════════════════════════════════════════════════
// SERVER START
// ═══════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`  ✅ AI ASSISTANT BACKEND v3.0 RUNNING`);
  console.log(`  🌐 HTTP: http://localhost:${PORT}`);
  console.log(`  🔌 WebSocket: ws://localhost:${PORT}`);
  console.log('═══════════════════════════════════════════════════════════\n');
});

// Handle WebSocket upgrade
server.on('upgrade', (request, socket, head) => {
  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit('connection', ws, request);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n[Server] Shutting down gracefully...');
  
  reminderService.stop();
  budgetManager.saveUsage();
  
  server.close(() => {
    console.log('[Server] ✅ Closed');
    process.exit(0);
  });
});
