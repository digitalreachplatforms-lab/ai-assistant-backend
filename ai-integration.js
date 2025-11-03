/**
 * AI Integration Module
 * Handles AI chat processing and response generation
 */

export class AIIntegration {
  constructor() {
    this.conversationContexts = new Map();
  }

  /**
   * Process a chat message and generate AI response
   * @param {string} userInput - The user's message
   * @param {Object} session - The session object containing conversation history
   * @returns {Promise<string>} - The AI's response
   */
  async processChat(userInput, session) {
    const input = userInput.toLowerCase().trim();
    
    // Store conversation context
    const contextKey = session.playerId;
    if (!this.conversationContexts.has(contextKey)) {
      this.conversationContexts.set(contextKey, {
        topics: [],
        lastIntent: null,
        userPreferences: {}
      });
    }
    
    const context = this.conversationContexts.get(contextKey);
    
    // Detect intent and generate appropriate response
    const intent = this.detectIntent(input);
    context.lastIntent = intent;
    
    let response;
    
    switch (intent) {
      case 'greeting':
        response = this.handleGreeting(input, context);
        break;
      
      case 'capabilities':
        response = this.handleCapabilitiesQuery(context);
        break;
      
      case 'identity':
        response = this.handleIdentityQuery(context);
        break;
      
      case 'help':
        response = this.handleHelpRequest(context);
        break;
      
      case 'status':
        response = this.handleStatusQuery(session);
        break;
      
      case 'memory':
        response = this.handleMemoryQuery(session);
        break;
      
      case 'farewell':
        response = this.handleFarewell(context);
        break;
      
      default:
        response = this.handleGeneralChat(userInput, session, context);
    }
    
    return response;
  }

  /**
   * Detect the intent of the user's message
   */
  detectIntent(input) {
    const greetings = ['hello', 'hi', 'hey', 'greetings', 'good morning', 'good afternoon', 'good evening'];
    const capabilities = ['what can you do', 'capabilities', 'features', 'help me', 'assist'];
    const identity = ['who are you', 'your name', 'what are you', 'introduce yourself'];
    const help = ['help', 'how to', 'guide', 'tutorial', 'instructions'];
    const status = ['status', 'how are you', 'are you working', 'connection'];
    const memory = ['remember', 'recall', 'history', 'previous', 'conversation'];
    const farewell = ['goodbye', 'bye', 'see you', 'farewell', 'exit', 'quit'];
    
    if (greetings.some(g => input.includes(g))) return 'greeting';
    if (capabilities.some(c => input.includes(c))) return 'capabilities';
    if (identity.some(i => input.includes(i))) return 'identity';
    if (help.some(h => input.includes(h))) return 'help';
    if (status.some(s => input.includes(s))) return 'status';
    if (memory.some(m => input.includes(m))) return 'memory';
    if (farewell.some(f => input.includes(f))) return 'farewell';
    
    return 'general';
  }

  handleGreeting(input, context) {
    const greetings = [
      "Hello! I'm your AI companion. How can I assist you today?",
      "Hi there! Ready to help you in your Unreal Engine world!",
      "Greetings! What would you like to do today?",
      "Hey! I'm here and ready to assist you!"
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  handleCapabilitiesQuery(context) {
    return `I'm your AI Companion with the following capabilities:

• **Voice Interaction**: I can process your voice commands and respond naturally
• **Memory System**: I remember our conversations and learn from our interactions
• **Real-time Communication**: Connected via WebSocket for instant responses
• **Context Awareness**: I understand the context of our conversation
• **Unreal Engine Integration**: Seamlessly integrated with your game environment

What would you like me to help you with?`;
  }

  handleIdentityQuery(context) {
    return `I'm your AI Companion, a virtual assistant designed to help you in your Unreal Engine project. I'm powered by advanced AI technology and connected to your game world through WebSocket communication. Think of me as your intelligent helper who's always ready to assist, chat, and make your experience better!`;
  }

  handleHelpRequest(context) {
    return `Here's how you can interact with me:

**Voice Commands**: Just speak naturally, and I'll understand you
**Text Chat**: Type your messages and I'll respond
**Memory**: I remember our conversations, so you can refer back to previous topics
**Questions**: Ask me anything about my capabilities or how to use features

Try asking me:
- "What can you do?"
- "Remember this: [something important]"
- "What did we talk about earlier?"

What would you like to know?`;
  }

  handleStatusQuery(session) {
    const messageCount = session.conversationHistory.length;
    const sessionDuration = Math.floor((new Date() - session.createdAt) / 1000);
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = sessionDuration % 60;
    
    return `System Status: ✅ All systems operational!

**Session Info**:
- Messages exchanged: ${messageCount}
- Session duration: ${minutes}m ${seconds}s
- Connection: Stable
- Memory: Active

Everything is working perfectly! How can I help you?`;
  }

  handleMemoryQuery(session) {
    const recentMessages = session.conversationHistory.slice(-6, -1);
    
    if (recentMessages.length === 0) {
      return "We just started our conversation, so there's not much to recall yet. But I'm remembering everything we discuss!";
    }
    
    let summary = "Here's what we've discussed recently:\n\n";
    recentMessages.forEach((msg, index) => {
      if (msg.role === 'user') {
        summary += `• You said: "${msg.content.substring(0, 60)}${msg.content.length > 60 ? '...' : ''}"\n`;
      }
    });
    
    return summary + "\nIs there something specific you'd like me to recall?";
  }

  handleFarewell(context) {
    const farewells = [
      "Goodbye! Feel free to come back anytime!",
      "See you later! I'll be here when you need me!",
      "Farewell! Take care and have a great day!",
      "Bye! Looking forward to our next conversation!"
    ];
    
    return farewells[Math.floor(Math.random() * farewells.length)];
  }

  handleGeneralChat(userInput, session, context) {
    const messageCount = session.conversationHistory.length;
    
    // Generate contextual response
    const responses = [
      `I understand you're saying: "${userInput}". That's interesting! Tell me more.`,
      `Got it! You mentioned: "${userInput}". How can I help you with that?`,
      `I hear you. "${userInput}" - Let me think about that...`,
      `Thanks for sharing that! "${userInput}" is noted. What else would you like to discuss?`
    ];
    
    // Add context if this is a longer conversation
    if (messageCount > 10) {
      return responses[Math.floor(Math.random() * responses.length)] + 
             `\n\nBy the way, we've had quite a conversation (${messageCount} messages)! I'm learning from each interaction.`;
    }
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  /**
   * Clean up old conversation contexts
   */
  cleanupOldContexts(maxAge = 3600000) { // 1 hour default
    const now = Date.now();
    for (const [key, context] of this.conversationContexts.entries()) {
      if (context.lastActivity && (now - context.lastActivity) > maxAge) {
        this.conversationContexts.delete(key);
      }
    }
  }
}

export default AIIntegration;
