// AI Assistant Backend - WebSocket Server
// Production-ready server for Unreal Engine AI Companion

import { WebSocketServer } from 'ws';
import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { AIIntegration } from './ai-integration.js';
import { VoiceProcessor } from './voice-processor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(cors());
app.use(express.json());

// Serve static files (control panel)
app.use(express.static(path.join(__dirname, '../public')));

// Store connected clients
const clients = new Map();

// Store player sessions
const sessions = new Map();

// Initialize AI and Voice processors
const aiIntegration = new AIIntegration();
const voiceProcessor = new VoiceProcessor();

console.log('[Server] AI Assistant Backend starting...');
console.log('[Server] Initializing AI Integration...');
console.log('[Server] Initializing Voice Processor...');

// HTTP endpoints
app.get('/', (req, res) => {
  res.json({
    status: 'running',
    service: 'AI Assistant Backend',
    version: '1.0.0',
    connectedClients: clients.size,
    activeSessions: sessions.size,
    features: [
      'WebSocket Communication',
      'Player Registration',
      'Chat Processing',
      'Voice Data Handling',
      'Memory Management',
      'AI Integration Ready'
    ]
  });
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    uptime: process.uptime(),
    connections: clients.size,
    sessions: sessions.size,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    websocket: 'active',
    clients: clients.size,
    sessions: sessions.size,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

// API endpoint for testing
app.post('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend is responding',
    timestamp: new Date().toISOString()
  });
});

// WebSocket connection handling
wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  const clientIp = req.socket.remoteAddress;
  console.log(`[WebSocket] New connection: ${clientId} from ${clientIp}`);
  
  clients.set(clientId, {
    ws,
    playerId: null,
    connectedAt: new Date(),
    lastActivity: new Date()
  });

  // Send welcome message
  const welcomeMessage = {
    type: 'connected',
    clientId,
    message: 'Connected to AI Assistant Backend',
    timestamp: new Date().toISOString(),
    serverVersion: '1.0.0'
  };
  
  ws.send(JSON.stringify(welcomeMessage));
  console.log(`[WebSocket] Sent welcome message to ${clientId}`);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      console.log(`[WebSocket] Message from ${clientId} (${message.type}):`, 
        message.type === 'voice_data' ? '[Voice Data]' : JSON.stringify(message).substring(0, 100));

      // Update last activity
      const client = clients.get(clientId);
      if (client) {
        client.lastActivity = new Date();
      }

      await handleMessage(clientId, message, ws);
    } catch (error) {
      console.error(`[WebSocket] Error processing message from ${clientId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString()
      }));
    }
  });

  ws.on('close', () => {
    console.log(`[WebSocket] Client disconnected: ${clientId}`);
    const client = clients.get(clientId);
    if (client && client.playerId) {
      const session = sessions.get(client.playerId);
      if (session) {
        console.log(`[Session] Closing session for player: ${client.playerId}`);
        sessions.delete(client.playerId);
      }
    }
    clients.delete(clientId);
  });

  ws.on('error', (error) => {
    console.error(`[WebSocket] Error for client ${clientId}:`, error);
  });

  // Set up ping interval to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      ws.ping();
    } else {
      clearInterval(pingInterval);
    }
  }, 30000); // Ping every 30 seconds
});

// Message handling
async function handleMessage(clientId, message, ws) {
  const client = clients.get(clientId);
  if (!client) {
    console.error(`[WebSocket] Client not found: ${clientId}`);
    return;
  }

  switch (message.type) {
    case 'register':
      // Register player
      const playerId = message.playerId || uuidv4();
      client.playerId = playerId;
      
      sessions.set(playerId, {
        clientId,
        playerId,
        conversationHistory: [],
        memory: {},
        createdAt: new Date(),
        lastInteraction: new Date()
      });
      
      const registerResponse = {
        type: 'registered',
        playerId,
        message: 'Player registered successfully',
        timestamp: new Date().toISOString()
      };
      
      ws.send(JSON.stringify(registerResponse));
      console.log(`[Session] Player registered: ${playerId}`);
      break;

    case 'chat':
      // Handle chat message
      const session = sessions.get(client.playerId);
      if (!session) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Player not registered. Please register first.',
          timestamp: new Date().toISOString()
        }));
        return;
      }

      // Store user message
      const userMessage = {
        role: 'user',
        content: message.text || message.message,
        timestamp: new Date()
      };
      session.conversationHistory.push(userMessage);
      session.lastInteraction = new Date();

      // Process with AI Integration
      const aiResponse = await aiIntegration.processChat(message.text || message.message, session);
      
      // Store assistant message
      const assistantMessage = {
        role: 'assistant',
        content: aiResponse,
        timestamp: new Date()
      };
      session.conversationHistory.push(assistantMessage);

      // Send response
    ws.send(JSON.stringify({
  type: 'chat_response',
  text: aiResponse,
  response: aiResponse,  // For web control panel compatibility
  timestamp: new Date().toISOString()
}));

      
      console.log(`[Chat] User: ${userMessage.content.substring(0, 50)}...`);
      console.log(`[Chat] AI: ${aiResponse.substring(0, 50)}...`);
      break;

    case 'voice_data':
      // Handle voice data
      console.log(`[Voice] Received voice data from ${client.playerId}`);
      
      // Process voice with Voice Processor
      const voiceResult = await voiceProcessor.processVoiceData(
        client.playerId,
        message.audioData || message.data,
        message.options || {}
      );
      
      if (voiceResult.success) {
        // If we have a transcription, process it with AI
        let aiResponse = null;
        const voiceSession = sessions.get(client.playerId);
        
        if (voiceResult.transcription && voiceSession) {
          // Add transcription to conversation history
          voiceSession.conversationHistory.push({
            role: 'user',
            content: voiceResult.transcription,
            type: 'voice',
            timestamp: new Date()
          });
          
          // Get AI response
          aiResponse = await aiIntegration.processChat(voiceResult.transcription, voiceSession);
          
          // Add AI response to history
          voiceSession.conversationHistory.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date()
          });
        }
        
        ws.send(JSON.stringify({
          type: 'voice_processed',
          transcription: voiceResult.transcription,
          isCommand: voiceResult.isCommand,
          aiResponse,
          confidence: voiceResult.confidence,
          timestamp: new Date().toISOString()
        }));
      } else {
        ws.send(JSON.stringify({
          type: 'voice_error',
          error: voiceResult.error,
          timestamp: new Date().toISOString()
        }));
      }
      break;

    case 'memory_add':
      // Add memory entry
      const memSession = sessions.get(client.playerId);
      if (!memSession) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Player not registered',
          timestamp: new Date().toISOString()
        }));
        return;
      }

      const memoryKey = message.key || 'general';
      if (!memSession.memory[memoryKey]) {
        memSession.memory[memoryKey] = [];
      }
      
      memSession.memory[memoryKey].push({
        content: message.content,
        timestamp: new Date()
      });

      ws.send(JSON.stringify({
        type: 'memory_added',
        key: memoryKey,
        timestamp: new Date().toISOString()
      }));
      break;

    case 'memory_get':
      // Retrieve memory
      const getSession = sessions.get(client.playerId);
      if (!getSession) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Player not registered',
          timestamp: new Date().toISOString()
        }));
        return;
      }

      ws.send(JSON.stringify({
        type: 'memory_data',
        memory: getSession.memory,
        conversationHistory: getSession.conversationHistory.slice(-10), // Last 10 messages
        timestamp: new Date().toISOString()
      }));
      break;

    case 'ping':
      // Respond to ping
      ws.send(JSON.stringify({
        type: 'pong',
        timestamp: new Date().toISOString()
      }));
      break;

    default:
      console.log(`[WebSocket] Unknown message type: ${message.type}`);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${message.type}`,
        timestamp: new Date().toISOString()
      }));
  }
}

// Cleanup interval for old data
setInterval(() => {
  aiIntegration.cleanupOldContexts();
  voiceProcessor.cleanupOldBuffers();
  console.log('[Cleanup] Performed periodic cleanup of old contexts and buffers');
}, 300000); // Every 5 minutes

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] ═══════════════════════════════════════════════`);
  console.log(`[Server] 🚀 AI Assistant Backend Started Successfully!`);
  console.log(`[Server] ═══════════════════════════════════════════════`);
  console.log(`[Server] HTTP Server: http://0.0.0.0:${PORT}`);
  console.log(`[Server] WebSocket: ws://0.0.0.0:${PORT}`);
  console.log(`[Server] Status: READY`);
  console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[Server] ═══════════════════════════════════════════════`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, shutting down gracefully...');
  
  // Close all WebSocket connections
  clients.forEach((client, clientId) => {
    client.ws.close();
  });
  
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('\n[Server] SIGINT received, shutting down gracefully...');
  
  // Close all WebSocket connections
  clients.forEach((client, clientId) => {
    client.ws.close();
  });
  
  server.close(() => {
    console.log('[Server] Server closed');
    process.exit(0);
  });
});
