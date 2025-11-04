/**
 * Budget Manager Service
 * Tracks API usage and costs across all services
 * Automatic failover when budgets exceeded
 * Detailed logging and on-screen notifications
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class BudgetManagerService {
  constructor(config = {}) {
    this.storageDir = path.join(__dirname, '../../data');
    this.budgetFile = path.join(this.storageDir, 'budget-tracking.json');

    // Budget limits (monthly)
    this.limits = {
      openai: config.openaiMonthlyLimit || 100, // $100/month
      anthropic: config.anthropicMonthlyLimit || 50,
      gemini: config.geminiMonthlyLimit || 25,
      elevenlabs: config.elevenlabsMonthlyLimit || 50,
      total: config.totalMonthlyLimit || 200
    };

    // Current usage
    this.usage = {
      openai: { cost: 0, requests: 0, tokens: 0, errors: 0 },
      anthropic: { cost: 0, requests: 0, tokens: 0, errors: 0 },
      gemini: { cost: 0, requests: 0, tokens: 0, errors: 0 },
      elevenlabs: { cost: 0, requests: 0, characters: 0, errors: 0 },
      freeTTS: { cost: 0, requests: 0, characters: 0, errors: 0 },
      whisper: { cost: 0, requests: 0, minutes: 0, errors: 0 }
    };

    // Service status
    this.serviceStatus = {
      openai: { enabled: true, reason: null },
      anthropic: { enabled: true, reason: null },
      gemini: { enabled: true, reason: null },
      elevenlabs: { enabled: true, reason: null },
      freeTTS: { enabled: true, reason: null },
      whisper: { enabled: true, reason: null }
    };

    // Notification callbacks
    this.notificationCallbacks = [];

    // Create storage directory
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Load existing data
    this.loadUsage();

    // Auto-save every 5 minutes
    setInterval(() => this.saveUsage(), 5 * 60 * 1000);

    // Reset usage monthly
    this.scheduleMonthlyReset();

    console.log('[BudgetManager] ✅ Initialized');
    console.log('[BudgetManager] Monthly limits:', this.limits);
  }

  /**
   * Register notification callback
   * @param {Function} callback - Callback function
   */
  onNotification(callback) {
    this.notificationCallbacks.push(callback);
  }

  /**
   * Send notification
   * @param {string} type - Notification type
   * @param {Object} data - Notification data
   */
  async sendNotification(type, data) {
    const notification = {
      type,
      ...data,
      timestamp: new Date().toISOString()
    };

    // Log to console
    const emoji = {
      'budget_warning': '⚠️',
      'budget_exceeded': '🚫',
      'service_failover': '🔄',
      'service_restored': '✅',
      'monthly_reset': '🔄'
    }[type] || '📊';

    console.log(`[BudgetManager] ${emoji} ${type.toUpperCase()}:`, data.message);

    // Send to all registered callbacks
    for (const callback of this.notificationCallbacks) {
      try {
        await callback(notification);
      } catch (error) {
        console.error('[BudgetManager] Error sending notification:', error.message);
      }
    }
  }

  /**
   * Track AI model usage
   * @param {string} model - Model name (openai, anthropic, gemini)
   * @param {number} tokens - Tokens used
   * @param {number} cost - Cost
   * @param {boolean} success - Success
   */
  async trackAIUsage(model, tokens, cost, success = true) {
    if (!this.usage[model]) {
      console.warn(`[BudgetManager] Unknown model: ${model}`);
      return;
    }

    this.usage[model].requests++;
    this.usage[model].tokens += tokens;
    this.usage[model].cost += cost;

    if (!success) {
      this.usage[model].errors++;
    }

    // Check budget
    await this.checkBudget(model);

    this.saveUsage();
  }

  /**
   * Track voice service usage
   * @param {string} service - Service name (elevenlabs, freeTTS)
   * @param {number} characters - Characters processed
   * @param {number} cost - Cost
   * @param {boolean} success - Success
   */
  async trackVoiceUsage(service, characters, cost, success = true) {
    if (!this.usage[service]) {
      console.warn(`[BudgetManager] Unknown service: ${service}`);
      return;
    }

    this.usage[service].requests++;
    this.usage[service].characters += characters;
    this.usage[service].cost += cost;

    if (!success) {
      this.usage[service].errors++;
    }

    // Check budget
    await this.checkBudget(service);

    this.saveUsage();
  }

  /**
   * Track Whisper usage
   * @param {number} minutes - Audio minutes
   * @param {number} cost - Cost
   * @param {boolean} success - Success
   */
  async trackWhisperUsage(minutes, cost, success = true) {
    this.usage.whisper.requests++;
    this.usage.whisper.minutes += minutes;
    this.usage.whisper.cost += cost;

    if (!success) {
      this.usage.whisper.errors++;
    }

    // Whisper is part of OpenAI budget
    await this.checkBudget('openai');

    this.saveUsage();
  }

  /**
   * Check budget and trigger failover if needed
   * @param {string} service - Service name
   */
  async checkBudget(service) {
    const usage = this.usage[service];
    const limit = this.limits[service];

    if (!limit) return; // No limit set

    const percentUsed = (usage.cost / limit) * 100;

    // Warning at 80%
    if (percentUsed >= 80 && percentUsed < 100 && this.serviceStatus[service].enabled) {
      await this.sendNotification('budget_warning', {
        service,
        message: `${service} budget at ${percentUsed.toFixed(1)}% (${usage.cost.toFixed(2)}/${limit})`,
        percentUsed,
        cost: usage.cost,
        limit,
        remaining: limit - usage.cost
      });
    }

    // Exceeded at 100%
    if (percentUsed >= 100 && this.serviceStatus[service].enabled) {
      await this.handleBudgetExceeded(service);
    }

    // Check total budget
    const totalCost = Object.values(this.usage).reduce((sum, u) => sum + u.cost, 0);
    const totalPercentUsed = (totalCost / this.limits.total) * 100;

    if (totalPercentUsed >= 80 && totalPercentUsed < 100) {
      await this.sendNotification('budget_warning', {
        service: 'total',
        message: `Total budget at ${totalPercentUsed.toFixed(1)}% ($${totalCost.toFixed(2)}/$${this.limits.total})`,
        percentUsed: totalPercentUsed,
        cost: totalCost,
        limit: this.limits.total,
        remaining: this.limits.total - totalCost
      });
    }
  }

  /**
   * Handle budget exceeded
   * @param {string} service - Service name
   */
  async handleBudgetExceeded(service) {
    console.log(`[BudgetManager] 🚫 Budget exceeded for: ${service}`);

    // Disable service
    this.serviceStatus[service].enabled = false;
    this.serviceStatus[service].reason = 'budget_exceeded';

    await this.sendNotification('budget_exceeded', {
      service,
      message: `${service} budget exceeded! Switching to fallback...`,
      cost: this.usage[service].cost,
      limit: this.limits[service]
    });

    // Trigger failover
    await this.triggerFailover(service);
  }

  /**
   * Trigger failover to alternative service
   * @param {string} service - Service name
   */
  async triggerFailover(service) {
    let fallbackService = null;
    let fallbackMessage = '';

    switch (service) {
      case 'openai':
        // Failover: OpenAI → Anthropic → Gemini
        if (this.serviceStatus.anthropic.enabled) {
          fallbackService = 'anthropic';
          fallbackMessage = 'Switched AI from OpenAI (GPT-4) to Anthropic (Claude)';
        } else if (this.serviceStatus.gemini.enabled) {
          fallbackService = 'gemini';
          fallbackMessage = 'Switched AI from OpenAI (GPT-4) to Google (Gemini)';
        } else {
          fallbackMessage = '⚠️ All AI services exceeded budget!';
        }
        break;

      case 'anthropic':
        // Failover: Anthropic → Gemini → OpenAI
        if (this.serviceStatus.gemini.enabled) {
          fallbackService = 'gemini';
          fallbackMessage = 'Switched AI from Anthropic (Claude) to Google (Gemini)';
        } else if (this.serviceStatus.openai.enabled) {
          fallbackService = 'openai';
          fallbackMessage = 'Switched AI from Anthropic (Claude) to OpenAI (GPT-4)';
        } else {
          fallbackMessage = '⚠️ All AI services exceeded budget!';
        }
        break;

      case 'gemini':
        // Failover: Gemini → OpenAI → Anthropic
        if (this.serviceStatus.openai.enabled) {
          fallbackService = 'openai';
          fallbackMessage = 'Switched AI from Google (Gemini) to OpenAI (GPT-4)';
        } else if (this.serviceStatus.anthropic.enabled) {
          fallbackService = 'anthropic';
          fallbackMessage = 'Switched AI from Google (Gemini) to Anthropic (Claude)';
        } else {
          fallbackMessage = '⚠️ All AI services exceeded budget!';
        }
        break;

      case 'elevenlabs':
        // Failover: ElevenLabs → Free TTS (always available)
        fallbackService = 'freeTTS';
        fallbackMessage = 'Switched voice from ElevenLabs (premium) to Free TTS (basic)';
        break;

      default:
        fallbackMessage = `No fallback available for: ${service}`;
    }

    if (fallbackService) {
      await this.sendNotification('service_failover', {
        from: service,
        to: fallbackService,
        message: fallbackMessage
      });
    } else {
      await this.sendNotification('service_failover', {
        from: service,
        to: null,
        message: fallbackMessage
      });
    }
  }

  /**
   * Check if service is available
   * @param {string} service - Service name
   * @returns {boolean} - Available
   */
  isServiceAvailable(service) {
    return this.serviceStatus[service]?.enabled || false;
  }

  /**
   * Get recommended service
   * @param {string} type - Service type ('ai' or 'voice')
   * @returns {string} - Recommended service name
   */
  getRecommendedService(type) {
    if (type === 'ai') {
      // Priority: OpenAI → Anthropic → Gemini
      if (this.isServiceAvailable('openai')) return 'openai';
      if (this.isServiceAvailable('anthropic')) return 'anthropic';
      if (this.isServiceAvailable('gemini')) return 'gemini';
      return null;
    }

    if (type === 'voice') {
      // Priority: ElevenLabs → Free TTS
      if (this.isServiceAvailable('elevenlabs')) return 'elevenlabs';
      return 'freeTTS'; // Always available
    }

    return null;
  }

  /**
   * Get usage statistics
   * @returns {Object} - Statistics
   */
  getStats() {
    const totalCost = Object.values(this.usage).reduce((sum, u) => sum + u.cost, 0);
    const totalRequests = Object.values(this.usage).reduce((sum, u) => sum + u.requests, 0);

    return {
      total: {
        cost: totalCost,
        requests: totalRequests,
        limit: this.limits.total,
        remaining: this.limits.total - totalCost,
        percentUsed: (totalCost / this.limits.total * 100).toFixed(1) + '%'
      },
      services: Object.entries(this.usage).map(([name, usage]) => ({
        name,
        ...usage,
        limit: this.limits[name] || 0,
        remaining: (this.limits[name] || 0) - usage.cost,
        percentUsed: this.limits[name] 
          ? (usage.cost / this.limits[name] * 100).toFixed(1) + '%'
          : 'N/A',
        enabled: this.serviceStatus[name]?.enabled || false,
        reason: this.serviceStatus[name]?.reason || null
      })),
      status: this.serviceStatus
    };
  }

  /**
   * Get detailed report
   * @returns {string} - Formatted report
   */
  getReport() {
    const stats = this.getStats();

    let report = '\n';
    report += '═══════════════════════════════════════════════════════\n';
    report += '                    BUDGET REPORT                      \n';
    report += '═══════════════════════════════════════════════════════\n\n';

    report += `Total Budget: $${stats.total.cost.toFixed(2)} / $${stats.total.limit} (${stats.total.percentUsed})\n`;
    report += `Remaining: $${stats.total.remaining.toFixed(2)}\n`;
    report += `Total Requests: ${stats.total.requests}\n\n`;

    report += '───────────────────────────────────────────────────────\n';
    report += 'SERVICE BREAKDOWN:\n';
    report += '───────────────────────────────────────────────────────\n\n';

    for (const service of stats.services) {
      const status = service.enabled ? '✅' : '🚫';
      report += `${status} ${service.name.toUpperCase()}\n`;
      report += `   Cost: $${service.cost.toFixed(2)} / $${service.limit} (${service.percentUsed})\n`;
      report += `   Requests: ${service.requests} | Errors: ${service.errors}\n`;
      
      if (service.tokens) {
        report += `   Tokens: ${service.tokens.toLocaleString()}\n`;
      }
      if (service.characters) {
        report += `   Characters: ${service.characters.toLocaleString()}\n`;
      }
      if (service.minutes) {
        report += `   Minutes: ${service.minutes.toFixed(2)}\n`;
      }
      
      if (!service.enabled && service.reason) {
        report += `   ⚠️ Disabled: ${service.reason}\n`;
      }
      
      report += '\n';
    }

    report += '═══════════════════════════════════════════════════════\n';

    return report;
  }

  /**
   * Reset monthly usage
   */
  async resetMonthlyUsage() {
    console.log('[BudgetManager] 🔄 Resetting monthly usage...');

    // Save current month's data for history
    const history = {
      month: new Date().toISOString().substring(0, 7), // YYYY-MM
      usage: { ...this.usage },
      timestamp: new Date().toISOString()
    };

    // Append to history file
    const historyFile = path.join(this.storageDir, 'budget-history.json');
    let historyData = [];
    
    if (fs.existsSync(historyFile)) {
      historyData = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    
    historyData.push(history);
    fs.writeFileSync(historyFile, JSON.stringify(historyData, null, 2));

    // Reset usage
    for (const service in this.usage) {
      this.usage[service] = { cost: 0, requests: 0, tokens: 0, characters: 0, minutes: 0, errors: 0 };
    }

    // Re-enable all services
    for (const service in this.serviceStatus) {
      this.serviceStatus[service].enabled = true;
      this.serviceStatus[service].reason = null;
    }

    this.saveUsage();

    await this.sendNotification('monthly_reset', {
      message: 'Monthly budget reset complete. All services re-enabled.',
      previousMonth: history.month
    });

    console.log('[BudgetManager] ✅ Monthly reset complete');
  }

  /**
   * Schedule monthly reset
   */
  scheduleMonthlyReset() {
    // Calculate time until next month
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0);
    const timeUntilReset = nextMonth - now;

    setTimeout(async () => {
      await this.resetMonthlyUsage();
      
      // Schedule next reset
      this.scheduleMonthlyReset();
    }, timeUntilReset);

    console.log(`[BudgetManager] Next reset scheduled for: ${nextMonth.toISOString()}`);
  }

  /**
   * Manually reset service
   * @param {string} service - Service name
   */
  async resetService(service) {
    if (this.usage[service]) {
      this.usage[service] = { cost: 0, requests: 0, tokens: 0, characters: 0, minutes: 0, errors: 0 };
      this.serviceStatus[service].enabled = true;
      this.serviceStatus[service].reason = null;

      this.saveUsage();

      await this.sendNotification('service_restored', {
        service,
        message: `${service} manually reset and re-enabled`
      });

      console.log(`[BudgetManager] ✅ ${service} reset`);
    }
  }

  /**
   * Save usage to disk
   */
  saveUsage() {
    try {
      const data = {
        usage: this.usage,
        serviceStatus: this.serviceStatus,
        limits: this.limits,
        lastSaved: new Date().toISOString()
      };

      fs.writeFileSync(this.budgetFile, JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('[BudgetManager] ❌ Error saving usage:', error.message);
    }
  }

  /**
   * Load usage from disk
   */
  loadUsage() {
    try {
      if (fs.existsSync(this.budgetFile)) {
        const data = JSON.parse(fs.readFileSync(this.budgetFile, 'utf8'));
        
        this.usage = data.usage || this.usage;
        this.serviceStatus = data.serviceStatus || this.serviceStatus;
        
        console.log('[BudgetManager] ✅ Loaded usage data');
      }
    } catch (error) {
      console.error('[BudgetManager] ❌ Error loading usage:', error.message);
    }
  }
}

export default BudgetManagerService;
