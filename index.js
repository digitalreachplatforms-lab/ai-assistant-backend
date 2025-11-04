/**
 * Complete AI Assistant Backend v3.0
 * Integrated system  with:
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

// FIXED: Import services from root directory (not services/ folder)
import { MultiModelAIService } from './multi-model-ai-service.js';
import { CalendarService } from './calendar-service.js';
import { ReminderService } from './reminder-service.js';
import { PriorityAssessmentService } from './priority-assessment-service.js';
import { CalendarConversationFlow } from './calendar-conversation-flow.js';
import { BudgetManagerService } from './budget-manager-service.js';

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
console.log('  ✅ AI ASSISTANT BACKEND v3.0 - INITIALIZING');
console.log('═══════════════════════════════════════════════════════════\n');

// Budget Manager (initialize first to track all usage)
const budgetManager = new BudgetManagerService({
  openaiLimit: parseFloat(process.env.OPENAI_BUDGET_LIMIT) || 50.0,
  anthropicLimit: parseFloat(process.env.ANTHROPIC_BUDGET_LIMIT) || 50.0,
  geminiLimit: parseFloat(process.env.GEMINI_BUDGET_LIMIT) || 50.0,
  elevenlabsLimit: parseFloat(process.env.ELEVENLABS_BUDGET_LIMIT) || 20.0,
});

console.log('✅ Budget Manager initialized');

// Multi-Model AI Service
const aiService = new MultiModelAIService({
  openaiKey: process.env.OPENAI_API_KEY,
  anthropicKey: process.env.ANTHROPIC_API_KEY,
  geminiKey: process.env.GEMINI_API_KEY,
  budgetManager,
});

console.log('✅ Multi-Model AI Service initialized');

// Calendar Service
const calendarService = new CalendarService({
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleRedirectUri: process.env.GOOGLE_REDIRECT_URI,
});

console.log('✅ Calendar Service initialized');

// Reminder Service
const reminderService = new ReminderService({
  calendarService,
});

console.log('✅ Reminder Service initialized');

// Priority Assessment Service
const priorityService = new PriorityAssessmentService({
  aiService,
});

console.log('✅ Priority Assessment Service initialized');

// Calendar Conversation Flow
const calendarFlow = new CalendarConversationFlow({
  calendarService,
  reminderService,
  priorityService,
  aiService,
});

console.log('✅ Calendar Conversation Flow initialized');

// ═══════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════

const sessions = new Map(); // playerId → { ws, playerData, conversationState }

// ═══════════════════════════════════════════════════════════
// WEBSOCKET SERVER
// ═══════════════════════════════════════════════════════════

const server = app.listen(PORT, () => {
  console.log(`\n✅ AI ASSISTANT BACKEND v3.0 RUNNING`);
  console.log(`✅ HTTP Server: http://localhost:${PORT}`);
  console.log(`✅ WebSocket Server: ws://localhost:${PORT}`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('🔌 New WebSocket connection');
  
  let playerId = null;
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log('📨 Received:', message.type);
      
      switch (message.type) {
        case 'register':
          playerId = message.playerId || `player_${Date.now()}`;
          sessions.set(playerId, {
            ws,
            playerData: message,
            conversationState: {},
          });
          
          ws.send(JSON.stringify({
            type: 'registered',
            playerId,
            message: 'Connected to AI Assistant Backend v3.0',
            timestamp: new Date().toISOString(),
          }));
          
          console.log(`✅ Player registered: ${playerId}`);
          break;
          
        case 'chat':
          // FIXED: Proper error handling and AI response
          if (!playerId) {
            ws.send(JSON.stringify({
              type: 'error',
              message: 'Player not registered. Send register message first.',
              timestamp: new Date().toISOString(),
            }));
            break;
          }
          
          // Get AI response
          const userMessage = message.message || message.text || '';
          const response = await aiService.chat(userMessage, {
            playerId,
            context: sessions.get(playerId)?.conversationState,
          });
          
          ws.send(JSON.stringify({
            type: 'chat_response',
            message: response,
            timestamp: new Date().toISOString(),
          }));
          
          console.log(`💬 Chat response sent to ${playerId}`);
          break;
          
        case 'voice':
          // Voice transcription (future implementation)
          ws.send(JSON.stringify({
            type: 'voice_response',
            message: 'Voice processing not yet implemented',
            timestamp: new Date().toISOString(),
          }));
          break;
          
        default:
          console.log(`⚠️  Unknown message type: ${message.type}`);
          ws.send(JSON.stringify({
            type: 'error',
            message: `Unknown message type: ${message.type}`,
            timestamp: new Date().toISOString(),
          }));
      }
    } catch (error) {
      console.error('❌ Error processing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: error.message,
        timestamp: new Date().toISOString(),
      }));
    }
  });
  
  ws.on('close', () => {
    if (playerId) {
      sessions.delete(playerId);
      console.log(`👋 Player disconnected: ${playerId}`);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error);
  });
});

// ═══════════════════════════════════════════════════════════
// HTTP ENDPOINTS
// ═══════════════════════════════════════════════════════════

app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: '3.0.0',
    uptime: process.uptime(),
    connections: wss.clients.size,
    sessions: sessions.size,
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/budget', (req, res) => {
  res.json(budgetManager.getStatus());
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'AI Assistant Backend',
    version: '3.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      budget: '/api/budget',
      websocket: 'ws://[host]:[port]',
    },
    timestamp: new Date().toISOString(),
  });
});

// ═══════════════════════════════════════════════════════════
// GRACEFUL SHUTDOWN
// ═══════════════════════════════════════════════════════════

process.on('SIGTERM', () => {
  console.log('\n⚠️  SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
