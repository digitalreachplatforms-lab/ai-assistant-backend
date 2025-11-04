/**
 * Priority Assessment Service
 * AI-powered priority evaluation for calendar events
 * Determines importance and recommends actions
 */

export class PriorityAssessmentService {
  constructor(multiModelAI) {
    this.ai = multiModelAI;
    
    // Priority thresholds
    this.thresholds = {
      critical: 9, // 9-10: Must reschedule immediately
      high: 7,     // 7-8: Should reschedule soon
      medium: 4,   // 4-6: Consider rescheduling or removing
      low: 1       // 1-3: Suggest removal
    };

    console.log('[PriorityAssessment] ✅ Initialized');
  }

  /**
   * Assess event priority
   * @param {Object} event - Event object
   * @param {Object} context - Additional context
   * @returns {Promise<Object>} - Assessment result
   */
  async assessPriority(event, context = {}) {
    try {
      const {
        userResponse = null,      // User's stated importance (1-10)
        missedReason = null,      // Why event was missed
        userHistory = [],         // Past event attendance
        currentSchedule = []      // Current events
      } = context;

      // Build assessment prompt
      const prompt = this.buildAssessmentPrompt(event, {
        userResponse,
        missedReason,
        userHistory,
        currentSchedule
      });

      // Get AI assessment
      const result = await this.ai.generateCompletion([
        {
          role: 'system',
          content: 'You are an intelligent calendar assistant that helps users prioritize their commitments. Analyze events and provide actionable recommendations.'
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        temperature: 0.3, // Lower temperature for consistent assessments
        maxTokens: 300,
        taskType: 'priority_assessment'
      });

      if (!result.success) {
        throw new Error('AI assessment failed');
      }

      // Parse AI response
      const assessment = this.parseAssessment(result.content, userResponse);

      console.log(`[PriorityAssessment] ✅ Assessed "${event.title}": Priority ${assessment.priorityScore}/10`);

      return {
        success: true,
        ...assessment,
        aiModel: result.model
      };

    } catch (error) {
      console.error('[PriorityAssessment] ❌ Error:', error.message);
      
      // Fallback to rule-based assessment
      return this.fallbackAssessment(event, context);
    }
  }

  /**
   * Build assessment prompt
   */
  buildAssessmentPrompt(event, context) {
    let prompt = `Assess the priority of this calendar event:\n\n`;
    prompt += `Event: ${event.title}\n`;
    prompt += `Description: ${event.description || 'None'}\n`;
    prompt += `Date: ${new Date(event.startTime).toLocaleString()}\n`;
    prompt += `Duration: ${this.calculateDuration(event.startTime, event.endTime)}\n`;
    prompt += `Location: ${event.location || 'Not specified'}\n`;
    prompt += `Notes: ${event.notes || 'None'}\n\n`;

    if (context.userResponse) {
      prompt += `User's stated importance: ${context.userResponse}/10\n\n`;
    }

    if (context.missedReason) {
      prompt += `Reason for missing: ${context.missedReason}\n\n`;
    }

    if (context.userHistory && context.userHistory.length > 0) {
      prompt += `User's attendance history:\n`;
      for (const past of context.userHistory.slice(-5)) {
        prompt += `- ${past.title}: ${past.attended ? 'Attended' : 'Missed'}\n`;
      }
      prompt += `\n`;
    }

    prompt += `Please provide:\n`;
    prompt += `1. Priority score (1-10)\n`;
    prompt += `2. Recommendation (reschedule_urgent, reschedule_soon, consider_options, or remove)\n`;
    prompt += `3. Brief reasoning (one sentence)\n`;
    prompt += `4. Suggested action (specific advice)\n\n`;
    prompt += `Format your response as:\n`;
    prompt += `PRIORITY: [number]\n`;
    prompt += `RECOMMENDATION: [action]\n`;
    prompt += `REASONING: [explanation]\n`;
    prompt += `ACTION: [advice]`;

    return prompt;
  }

  /**
   * Parse AI assessment response
   */
  parseAssessment(content, userResponse) {
    const lines = content.split('\n');
    
    let priorityScore = userResponse || 5;
    let recommendation = 'consider_options';
    let reasoning = 'Unable to determine priority';
    let suggestedAction = 'Please provide more information';

    for (const line of lines) {
      if (line.startsWith('PRIORITY:')) {
        const match = line.match(/(\d+)/);
        if (match) priorityScore = parseInt(match[1]);
      } else if (line.startsWith('RECOMMENDATION:')) {
        recommendation = line.split(':')[1].trim().toLowerCase();
      } else if (line.startsWith('REASONING:')) {
        reasoning = line.split(':')[1].trim();
      } else if (line.startsWith('ACTION:')) {
        suggestedAction = line.split(':')[1].trim();
      }
    }

    // Ensure priority is within range
    priorityScore = Math.max(1, Math.min(10, priorityScore));

    return {
      priorityScore,
      recommendation,
      reasoning,
      suggestedAction,
      category: this.categorizePriority(priorityScore)
    };
  }

  /**
   * Categorize priority score
   */
  categorizePriority(score) {
    if (score >= this.thresholds.critical) return 'critical';
    if (score >= this.thresholds.high) return 'high';
    if (score >= this.thresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Fallback assessment (rule-based)
   */
  fallbackAssessment(event, context) {
    console.log('[PriorityAssessment] Using fallback rule-based assessment');

    let priorityScore = context.userResponse || 5;

    // Adjust based on event type (detected from title/description)
    const text = `${event.title} ${event.description}`.toLowerCase();
    
    if (text.includes('doctor') || text.includes('dentist') || text.includes('medical')) {
      priorityScore = Math.max(priorityScore, 8);
    } else if (text.includes('interview') || text.includes('meeting')) {
      priorityScore = Math.max(priorityScore, 7);
    } else if (text.includes('appointment')) {
      priorityScore = Math.max(priorityScore, 6);
    }

    const category = this.categorizePriority(priorityScore);
    
    let recommendation, reasoning, suggestedAction;

    switch (category) {
      case 'critical':
        recommendation = 'reschedule_urgent';
        reasoning = 'This is a critical event that should not be missed';
        suggestedAction = 'Reschedule immediately to the next available time';
        break;
      
      case 'high':
        recommendation = 'reschedule_soon';
        reasoning = 'This is an important event that should be rescheduled';
        suggestedAction = 'Find a suitable time within the next week';
        break;
      
      case 'medium':
        recommendation = 'consider_options';
        reasoning = 'Consider whether this event is still relevant';
        suggestedAction = 'Decide whether to reschedule or remove based on current priorities';
        break;
      
      default:
        recommendation = 'remove';
        reasoning = 'This event has low priority and may not be necessary';
        suggestedAction = 'Consider removing this event from your calendar';
    }

    return {
      success: true,
      priorityScore,
      recommendation,
      reasoning,
      suggestedAction,
      category,
      aiModel: 'fallback'
    };
  }

  /**
   * Suggest reschedule times
   * @param {Object} event - Event object
   * @param {Array} currentSchedule - Current events
   * @param {Object} preferences - User preferences
   * @returns {Array} - Suggested times
   */
  suggestRescheduleTimes(event, currentSchedule = [], preferences = {}) {
    const {
      preferredDays = [1, 2, 3, 4, 5], // Monday-Friday
      preferredHours = [9, 10, 11, 14, 15, 16], // 9am-5pm
      minDaysOut = 1,
      maxDaysOut = 14
    } = preferences;

    const duration = new Date(event.endTime) - new Date(event.startTime);
    const suggestions = [];

    const startDate = new Date();
    startDate.setDate(startDate.getDate() + minDaysOut);

    for (let day = 0; day < maxDaysOut; day++) {
      const checkDate = new Date(startDate);
      checkDate.setDate(checkDate.getDate() + day);

      // Skip if not preferred day
      if (!preferredDays.includes(checkDate.getDay())) {
        continue;
      }

      // Check each preferred hour
      for (const hour of preferredHours) {
        const startTime = new Date(checkDate);
        startTime.setHours(hour, 0, 0, 0);

        const endTime = new Date(startTime.getTime() + duration);

        // Check for conflicts
        const hasConflict = currentSchedule.some(e => {
          const eStart = new Date(e.startTime);
          const eEnd = new Date(e.endTime);
          return (startTime < eEnd && endTime > eStart);
        });

        if (!hasConflict) {
          suggestions.push({
            startTime: startTime.toISOString(),
            endTime: endTime.toISOString(),
            dayOfWeek: checkDate.toLocaleDateString('en-US', { weekday: 'long' }),
            date: checkDate.toLocaleDateString(),
            time: startTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
          });

          // Limit to 5 suggestions
          if (suggestions.length >= 5) {
            return suggestions;
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Calculate duration
   */
  calculateDuration(startTime, endTime) {
    const duration = new Date(endTime) - new Date(startTime);
    const hours = Math.floor(duration / (1000 * 60 * 60));
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Detect conflicts
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @param {Array} schedule - Current schedule
   * @returns {Array} - Conflicting events
   */
  detectConflicts(startTime, endTime, schedule) {
    return schedule.filter(event => {
      const eStart = new Date(event.startTime);
      const eEnd = new Date(event.endTime);
      return (startTime < eEnd && endTime > eStart);
    });
  }

  /**
   * Evaluate importance based on patterns
   * @param {Object} event - Event object
   * @param {Array} userHistory - User history
   * @returns {Object} - Importance evaluation
   */
  evaluateImportance(event, userHistory = []) {
    const factors = {
      eventType: 0,
      frequency: 0,
      consequences: 0,
      historicalAttendance: 0
    };

    // Event type factor
    const text = `${event.title} ${event.description}`.toLowerCase();
    if (text.includes('doctor') || text.includes('dentist') || text.includes('medical')) {
      factors.eventType = 3; // High importance
    } else if (text.includes('interview') || text.includes('meeting')) {
      factors.eventType = 2; // Medium importance
    } else {
      factors.eventType = 1; // Low importance
    }

    // Frequency factor (recurring events more important)
    if (event.recurrence) {
      factors.frequency = 2;
    } else {
      factors.frequency = 1;
    }

    // Historical attendance factor
    const similarEvents = userHistory.filter(e => 
      e.title.toLowerCase().includes(event.title.toLowerCase().split(' ')[0])
    );

    if (similarEvents.length > 0) {
      const attendanceRate = similarEvents.filter(e => e.attended).length / similarEvents.length;
      factors.historicalAttendance = Math.round(attendanceRate * 3);
    } else {
      factors.historicalAttendance = 2; // Neutral
    }

    // Calculate total importance score
    const totalScore = Object.values(factors).reduce((sum, val) => sum + val, 0);
    const maxScore = 9; // 3 + 2 + 3 + 1 (max possible)
    const importanceScore = Math.round((totalScore / maxScore) * 10);

    return {
      importanceScore,
      factors,
      reasoning: `Based on event type (${factors.eventType}/3), frequency (${factors.frequency}/2), and attendance history (${factors.historicalAttendance}/3)`
    };
  }
}

export default PriorityAssessmentService;
