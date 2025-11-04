/**
 * Multi-Model AI Service
 * Intelligent failover between OpenAI (GPT-4), Anthropic (Claude), and Google (Gemini)
 * Automatic model selection based on availability, cost, and task suitability
 * Ensures system never goes down due to API limits or costs
 */

import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class MultiModelAIService {
  constructor(config) {
    this.config = {
      openai: {
        apiKey: config.openaiApiKey,
        model: 'gpt-4',
        enabled: !!config.openaiApiKey,
        costPer1kTokens: 0.03, // GPT-4 pricing
        priority: 1 // Higher priority = preferred
      },
      anthropic: {
        apiKey: config.anthropicApiKey,
        model: 'claude-3-5-sonnet-20241022',
        enabled: !!config.anthropicApiKey,
        costPer1kTokens: 0.003, // Claude pricing
        priority: 2
      },
      gemini: {
        apiKey: config.geminiApiKey,
        model: 'gemini-1.5-pro',
        enabled: !!config.geminiApiKey,
        costPer1kTokens: 0.00125, // Gemini pricing (free tier available)
        priority: 3
      }
    };

    // Initialize clients
    this.clients = {};
    
    if (this.config.openai.enabled) {
      this.clients.openai = new OpenAI({ apiKey: this.config.openai.apiKey });
    }
    
    if (this.config.anthropic.enabled) {
      this.clients.anthropic = new Anthropic({ apiKey: this.config.anthropic.apiKey });
    }
    
    if (this.config.gemini.enabled) {
      this.clients.gemini = new GoogleGenerativeAI(this.config.gemini.apiKey);
    }

    // Track usage and errors
    this.usage = {
      openai: { requests: 0, errors: 0, tokens: 0, cost: 0 },
      anthropic: { requests: 0, errors: 0, tokens: 0, cost: 0 },
      gemini: { requests: 0, errors: 0, tokens: 0, cost: 0 }
    };

    // Model availability (circuit breaker pattern)
    this.availability = {
      openai: { available: true, lastError: null, errorCount: 0 },
      anthropic: { available: true, lastError: null, errorCount: 0 },
      gemini: { available: true, lastError: null, errorCount: 0 }
    };

    console.log('[MultiModelAI] ✅ Initialized with models:', Object.keys(this.clients));
  }

  /**
   * Generate chat completion with automatic failover
   * @param {Array} messages - Chat messages
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} - Response
   */
  async generateCompletion(messages, options = {}) {
    const {
      temperature = 0.7,
      maxTokens = 500,
      preferredModel = null,
      taskType = 'general' // general, calendar, priority_assessment, etc.
    } = options;

    // Determine model priority based on task type
    const modelPriority = this.getModelPriority(taskType, preferredModel);

    // Try each model in priority order
    for (const modelName of modelPriority) {
      if (!this.isModelAvailable(modelName)) {
        console.log(`[MultiModelAI] ⚠️ ${modelName} not available, trying next...`);
        continue;
      }

      try {
        console.log(`[MultiModelAI] Attempting ${modelName}...`);
        
        const result = await this.callModel(modelName, messages, {
          temperature,
          maxTokens
        });

        // Success - update stats
        this.usage[modelName].requests++;
        this.usage[modelName].tokens += result.tokens;
        this.usage[modelName].cost += result.cost;
        
        // Reset error count on success
        this.availability[modelName].errorCount = 0;

        console.log(`[MultiModelAI] ✅ Success with ${modelName}`);
        
        return {
          success: true,
          model: modelName,
          content: result.content,
          tokens: result.tokens,
          cost: result.cost
        };

      } catch (error) {
        console.error(`[MultiModelAI] ❌ ${modelName} failed:`, error.message);
        
        // Update error tracking
        this.usage[modelName].errors++;
        this.availability[modelName].errorCount++;
        this.availability[modelName].lastError = error.message;

        // Circuit breaker: disable model after 3 consecutive errors
        if (this.availability[modelName].errorCount >= 3) {
          this.availability[modelName].available = false;
          console.log(`[MultiModelAI] 🚫 ${modelName} disabled due to repeated errors`);
          
          // Re-enable after 5 minutes
          setTimeout(() => {
            this.availability[modelName].available = true;
            this.availability[modelName].errorCount = 0;
            console.log(`[MultiModelAI] ✅ ${modelName} re-enabled`);
          }, 5 * 60 * 1000);
        }

        // Continue to next model
        continue;
      }
    }

    // All models failed
    return {
      success: false,
      error: 'All AI models failed',
      details: this.getAvailabilityStatus()
    };
  }

  /**
   * Call specific model
   * @param {string} modelName - Model name
   * @param {Array} messages - Messages
   * @param {Object} options - Options
   * @returns {Promise<Object>} - Result
   */
  async callModel(modelName, messages, options) {
    switch (modelName) {
      case 'openai':
        return await this.callOpenAI(messages, options);
      
      case 'anthropic':
        return await this.callAnthropic(messages, options);
      
      case 'gemini':
        return await this.callGemini(messages, options);
      
      default:
        throw new Error(`Unknown model: ${modelName}`);
    }
  }

  /**
   * Call OpenAI GPT-4
   */
  async callOpenAI(messages, options) {
    const response = await this.clients.openai.chat.completions.create({
      model: this.config.openai.model,
      messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    const tokens = response.usage.total_tokens;
    const cost = (tokens / 1000) * this.config.openai.costPer1kTokens;

    return {
      content: response.choices[0].message.content,
      tokens,
      cost
    };
  }

  /**
   * Call Anthropic Claude
   */
  async callAnthropic(messages, options) {
    // Convert OpenAI format to Anthropic format
    const systemMessage = messages.find(m => m.role === 'system');
    const conversationMessages = messages.filter(m => m.role !== 'system');

    const response = await this.clients.anthropic.messages.create({
      model: this.config.anthropic.model,
      system: systemMessage ? systemMessage.content : undefined,
      messages: conversationMessages.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content
      })),
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    const tokens = response.usage.input_tokens + response.usage.output_tokens;
    const cost = (tokens / 1000) * this.config.anthropic.costPer1kTokens;

    return {
      content: response.content[0].text,
      tokens,
      cost
    };
  }

  /**
   * Call Google Gemini
   */
  async callGemini(messages, options) {
    const model = this.clients.gemini.getGenerativeModel({
      model: this.config.gemini.model
    });

    // Convert to Gemini format
    const prompt = messages.map(m => {
      const role = m.role === 'assistant' ? 'model' : 'user';
      return `${role}: ${m.content}`;
    }).join('\n\n');

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature,
        maxOutputTokens: options.maxTokens
      }
    });

    const response = result.response;
    const tokens = response.usageMetadata?.totalTokenCount || 500; // Estimate if not provided
    const cost = (tokens / 1000) * this.config.gemini.costPer1kTokens;

    return {
      content: response.text(),
      tokens,
      cost
    };
  }

  /**
   * Get model priority based on task type
   * @param {string} taskType - Task type
   * @param {string} preferredModel - Preferred model (optional)
   * @returns {Array} - Model names in priority order
   */
  getModelPriority(taskType, preferredModel) {
    // If preferred model specified, try it first
    if (preferredModel && this.config[preferredModel]?.enabled) {
      const others = Object.keys(this.clients).filter(m => m !== preferredModel);
      return [preferredModel, ...others];
    }

    // Task-specific priorities
    const taskPriorities = {
      // GPT-4 best for complex reasoning
      priority_assessment: ['openai', 'anthropic', 'gemini'],
      calendar_management: ['openai', 'anthropic', 'gemini'],
      
      // Claude best for long context
      conversation: ['anthropic', 'openai', 'gemini'],
      
      // Gemini cheapest for simple tasks
      simple_response: ['gemini', 'anthropic', 'openai'],
      
      // Default: by priority setting
      general: this.getDefaultPriority()
    };

    return taskPriorities[taskType] || taskPriorities.general;
  }

  /**
   * Get default priority (by configured priority)
   */
  getDefaultPriority() {
    return Object.entries(this.config)
      .filter(([name, config]) => config.enabled)
      .sort((a, b) => a[1].priority - b[1].priority)
      .map(([name]) => name);
  }

  /**
   * Check if model is available
   * @param {string} modelName - Model name
   * @returns {boolean} - Available
   */
  isModelAvailable(modelName) {
    return this.config[modelName]?.enabled && 
           this.availability[modelName]?.available;
  }

  /**
   * Get availability status
   * @returns {Object} - Status
   */
  getAvailabilityStatus() {
    const status = {};
    
    for (const [name, config] of Object.entries(this.config)) {
      status[name] = {
        enabled: config.enabled,
        available: this.availability[name]?.available,
        errors: this.usage[name]?.errors || 0,
        lastError: this.availability[name]?.lastError
      };
    }

    return status;
  }

  /**
   * Get usage statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const total = {
      requests: 0,
      errors: 0,
      tokens: 0,
      cost: 0
    };

    const byModel = {};

    for (const [name, usage] of Object.entries(this.usage)) {
      total.requests += usage.requests;
      total.errors += usage.errors;
      total.tokens += usage.tokens;
      total.cost += usage.cost;

      byModel[name] = {
        ...usage,
        successRate: usage.requests > 0 
          ? ((usage.requests - usage.errors) / usage.requests * 100).toFixed(1) + '%'
          : '0%',
        avgCostPerRequest: usage.requests > 0
          ? (usage.cost / usage.requests).toFixed(4)
          : 0
      };
    }

    return {
      total: {
        ...total,
        successRate: total.requests > 0
          ? ((total.requests - total.errors) / total.requests * 100).toFixed(1) + '%'
          : '0%',
        avgCostPerRequest: total.requests > 0
          ? (total.cost / total.requests).toFixed(4)
          : 0
      },
      byModel,
      availability: this.getAvailabilityStatus()
    };
  }

  /**
   * Reset statistics
   */
  resetStats() {
    for (const name in this.usage) {
      this.usage[name] = { requests: 0, errors: 0, tokens: 0, cost: 0 };
    }
    console.log('[MultiModelAI] Stats reset');
  }

  /**
   * Manually enable/disable model
   * @param {string} modelName - Model name
   * @param {boolean} enabled - Enabled
   */
  setModelAvailability(modelName, enabled) {
    if (this.availability[modelName]) {
      this.availability[modelName].available = enabled;
      this.availability[modelName].errorCount = 0;
      console.log(`[MultiModelAI] ${modelName} ${enabled ? 'enabled' : 'disabled'} manually`);
    }
  }
}

export default MultiModelAIService;
