/**
 * Calendar Conversation Flow Service
 * Manages multi-turn conversations for calendar operations
 * Handles qualifying questions and autonomous decision-making
 */

export class CalendarConversationFlow {
  constructor(calendarService, priorityAssessment, multiModelAI) {
    this.calendar = calendarService;
    this.priorityAssessment = priorityAssessment;
    this.ai = multiModelAI;

    // Active conversations (playerId -> conversation state)
    this.conversations = new Map();

    console.log('[CalendarFlow] ✅ Initialized');
  }

  /**
   * Start event creation flow
   * @param {string} playerId - Player ID
   * @param {string} initialMessage - Initial message
   * @returns {Promise<Object>} - Response
   */
  async startEventCreation(playerId, initialMessage) {
    const conversation = {
      flowType: 'event_creation',
      step: 'title',
      data: {},
      history: [initialMessage],
      startedAt: new Date().toISOString()
    };

    this.conversations.set(playerId, conversation);

    return {
      message: "What would you like to call this event?",
      expectingInput: true,
      step: 'title'
    };
  }

  /**
   * Continue event creation flow
   * @param {string} playerId - Player ID
   * @param {string} userInput - User input
   * @returns {Promise<Object>} - Response
   */
  async continueEventCreation(playerId, userInput) {
    const conversation = this.conversations.get(playerId);
    
    if (!conversation || conversation.flowType !== 'event_creation') {
      return {
        error: 'No active event creation flow'
      };
    }

    conversation.history.push(userInput);

    switch (conversation.step) {
      case 'title':
        conversation.data.title = userInput;
        conversation.step = 'date_time';
        return {
          message: "When would you like to schedule it? (e.g., 'tomorrow at 2pm', 'next Tuesday at 10am')",
          expectingInput: true,
          step: 'date_time'
        };

      case 'date_time':
        const dateTime = await this.parseDateTime(userInput);
        if (!dateTime.success) {
          return {
            message: "I couldn't understand that date/time. Please try again (e.g., 'tomorrow at 2pm', 'November 15 at 3:30pm')",
            expectingInput: true,
            step: 'date_time'
          };
        }
        conversation.data.startTime = dateTime.startTime;
        conversation.step = 'duration';
        return {
          message: "How long will it take? (e.g., '1 hour', '30 minutes', '2 hours')",
          expectingInput: true,
          step: 'duration'
        };

      case 'duration':
        const duration = this.parseDuration(userInput);
        if (!duration) {
          return {
            message: "I couldn't understand that duration. Please try again (e.g., '1 hour', '30 minutes')",
            expectingInput: true,
            step: 'duration'
          };
        }
        conversation.data.endTime = new Date(new Date(conversation.data.startTime).getTime() + duration);
        conversation.step = 'location';
        return {
          message: "Where will this take place? (or say 'skip' if not applicable)",
          expectingInput: true,
          step: 'location'
        };

      case 'location':
        conversation.data.location = userInput.toLowerCase() === 'skip' ? '' : userInput;
        conversation.step = 'notes';
        return {
          message: "Any notes or details? (or say 'skip')",
          expectingInput: true,
          step: 'notes'
        };

      case 'notes':
        conversation.data.notes = userInput.toLowerCase() === 'skip' ? '' : userInput;
        conversation.step = 'priority';
        return {
          message: "How important is this event? (1-10, where 10 is most important)",
          expectingInput: true,
          step: 'priority'
        };

      case 'priority':
        const priority = parseInt(userInput);
        if (isNaN(priority) || priority < 1 || priority > 10) {
          return {
            message: "Please enter a number between 1 and 10",
            expectingInput: true,
            step: 'priority'
          };
        }
        conversation.data.priority = priority;
        conversation.step = 'confirm';
        
        // Show summary
        const summary = this.formatEventSummary(conversation.data);
        return {
          message: `Here's what I have:\n\n${summary}\n\nShould I create this event? (yes/no)`,
          expectingInput: true,
          step: 'confirm'
        };

      case 'confirm':
        if (userInput.toLowerCase().includes('yes')) {
          // Create event
          const result = await this.calendar.createEvent(playerId, conversation.data);
          
          this.conversations.delete(playerId);
          
          if (result.success) {
            return {
              message: `✅ Event "${result.event.title}" created successfully! I'll remind you before it starts.`,
              expectingInput: false,
              event: result.event
            };
          } else {
            return {
              message: `❌ Sorry, I couldn't create the event: ${result.error}`,
              expectingInput: false
            };
          }
        } else {
          this.conversations.delete(playerId);
          return {
            message: "Okay, I've cancelled the event creation.",
            expectingInput: false
          };
        }

      default:
        return {
          error: 'Unknown step'
        };
    }
  }

  /**
   * Start post-event assessment flow
   * @param {string} playerId - Player ID
   * @param {Object} event - Event object
   * @returns {Promise<Object>} - Response
   */
  async startPostEventAssessment(playerId, event) {
    const conversation = {
      flowType: 'post_event_assessment',
      step: 'attended',
      data: { event },
      history: [],
      startedAt: new Date().toISOString()
    };

    this.conversations.set(playerId, conversation);

    return {
      message: `Did you attend "${event.title}"? (yes/no)`,
      expectingInput: true,
      step: 'attended'
    };
  }

  /**
   * Continue post-event assessment flow
   * @param {string} playerId - Player ID
   * @param {string} userInput - User input
   * @returns {Promise<Object>} - Response
   */
  async continuePostEventAssessment(playerId, userInput) {
    const conversation = this.conversations.get(playerId);
    
    if (!conversation || conversation.flowType !== 'post_event_assessment') {
      return {
        error: 'No active post-event assessment flow'
      };
    }

    conversation.history.push(userInput);
    const event = conversation.data.event;

    switch (conversation.step) {
      case 'attended':
        if (userInput.toLowerCase().includes('yes')) {
          // Mark as completed
          await this.calendar.markAsCompleted(playerId, event.eventId);
          
          this.conversations.delete(playerId);
          
          return {
            message: `Great! I've marked "${event.title}" as completed.`,
            expectingInput: false
          };
        } else {
          // Missed event - assess priority
          conversation.step = 'importance';
          return {
            message: `I see. How important is this event to you? (1-10, where 10 is most important)`,
            expectingInput: true,
            step: 'importance'
          };
        }

      case 'importance':
        const importance = parseInt(userInput);
        if (isNaN(importance) || importance < 1 || importance > 10) {
          return {
            message: "Please enter a number between 1 and 10",
            expectingInput: true,
            step: 'importance'
          };
        }

        conversation.data.importance = importance;

        // Get AI assessment
        const assessment = await this.priorityAssessment.assessPriority(event, {
          userResponse: importance,
          missedReason: 'User did not attend'
        });

        conversation.data.assessment = assessment;

        // Determine next step based on priority
        if (assessment.priorityScore >= 7) {
          // High priority - offer reschedule
          conversation.step = 'reschedule_confirm';
          return {
            message: `Since this is important (${assessment.priorityScore}/10), I recommend rescheduling. ${assessment.reasoning}\n\nWould you like me to reschedule it? (yes/no)`,
            expectingInput: true,
            step: 'reschedule_confirm'
          };
        } else if (assessment.priorityScore >= 4) {
          // Medium priority - ask preference
          conversation.step = 'action_choice';
          return {
            message: `This event has medium priority (${assessment.priorityScore}/10). ${assessment.reasoning}\n\nWhat would you like to do?\n1. Reschedule it\n2. Remove it\n3. Keep it for reference\n\n(Reply with 1, 2, or 3)`,
            expectingInput: true,
            step: 'action_choice'
          };
        } else {
          // Low priority - suggest removal
          conversation.step = 'remove_confirm';
          return {
            message: `This event has low priority (${assessment.priorityScore}/10). ${assessment.reasoning}\n\nWould you like me to remove it from your calendar? (yes/no)`,
            expectingInput: true,
            step: 'remove_confirm'
          };
        }

      case 'reschedule_confirm':
        if (userInput.toLowerCase().includes('yes')) {
          conversation.step = 'reschedule_time';
          return {
            message: "When would work better for you? (e.g., 'tomorrow at 2pm', 'next week same time')",
            expectingInput: true,
            step: 'reschedule_time'
          };
        } else {
          conversation.step = 'action_choice';
          return {
            message: "Okay. What would you like to do instead?\n1. Remove it\n2. Keep it for reference\n\n(Reply with 1 or 2)",
            expectingInput: true,
            step: 'action_choice'
          };
        }

      case 'reschedule_time':
        const dateTime = await this.parseDateTime(userInput);
        if (!dateTime.success) {
          return {
            message: "I couldn't understand that date/time. Please try again (e.g., 'tomorrow at 2pm')",
            expectingInput: true,
            step: 'reschedule_time'
          };
        }

        // Reschedule event
        const result = await this.calendar.rescheduleEvent(
          playerId,
          event.eventId,
          dateTime.startTime,
          new Date(new Date(dateTime.startTime).getTime() + (new Date(event.endTime) - new Date(event.startTime)))
        );

        this.conversations.delete(playerId);

        if (result.success) {
          return {
            message: `✅ Rescheduled "${event.title}" to ${new Date(dateTime.startTime).toLocaleString()}. I'll remind you before it starts.`,
            expectingInput: false
          };
        } else {
          return {
            message: `❌ Sorry, I couldn't reschedule the event: ${result.error}`,
            expectingInput: false
          };
        }

      case 'action_choice':
        const choice = userInput.trim();
        
        if (choice === '1') {
          conversation.step = 'reschedule_time';
          return {
            message: "When would work better for you? (e.g., 'tomorrow at 2pm', 'next week same time')",
            expectingInput: true,
            step: 'reschedule_time'
          };
        } else if (choice === '2') {
          // Remove event
          await this.calendar.deleteEvent(playerId, event.eventId);
          this.conversations.delete(playerId);
          return {
            message: `✅ Removed "${event.title}" from your calendar.`,
            expectingInput: false
          };
        } else if (choice === '3') {
          // Keep for reference
          this.conversations.delete(playerId);
          return {
            message: `Okay, I'll keep "${event.title}" in your calendar for reference.`,
            expectingInput: false
          };
        } else {
          return {
            message: "Please reply with 1, 2, or 3",
            expectingInput: true,
            step: 'action_choice'
          };
        }

      case 'remove_confirm':
        if (userInput.toLowerCase().includes('yes')) {
          await this.calendar.deleteEvent(playerId, event.eventId);
          this.conversations.delete(playerId);
          return {
            message: `✅ Removed "${event.title}" from your calendar.`,
            expectingInput: false
          };
        } else {
          this.conversations.delete(playerId);
          return {
            message: `Okay, I'll keep "${event.title}" in your calendar.`,
            expectingInput: false
          };
        }

      default:
        return {
          error: 'Unknown step'
        };
    }
  }

  /**
   * Parse date/time from natural language
   * @param {string} input - User input
   * @returns {Promise<Object>} - Parsed date/time
   */
  async parseDateTime(input) {
    // Simple parsing (in production, use a library like chrono-node)
    const now = new Date();
    let startTime = null;

    // Tomorrow
    if (input.toLowerCase().includes('tomorrow')) {
      startTime = new Date(now);
      startTime.setDate(startTime.getDate() + 1);
      
      // Extract time
      const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const meridiem = timeMatch[3]?.toLowerCase();

        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;

        startTime.setHours(hours, minutes, 0, 0);
      } else {
        startTime.setHours(9, 0, 0, 0); // Default: 9am
      }

      return {
        success: true,
        startTime: startTime.toISOString()
      };
    }

    // Next week
    if (input.toLowerCase().includes('next week')) {
      startTime = new Date(now);
      startTime.setDate(startTime.getDate() + 7);
      
      // Extract time
      const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
      if (timeMatch) {
        let hours = parseInt(timeMatch[1]);
        const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
        const meridiem = timeMatch[3]?.toLowerCase();

        if (meridiem === 'pm' && hours < 12) hours += 12;
        if (meridiem === 'am' && hours === 12) hours = 0;

        startTime.setHours(hours, minutes, 0, 0);
      } else {
        startTime.setHours(9, 0, 0, 0);
      }

      return {
        success: true,
        startTime: startTime.toISOString()
      };
    }

    // Specific time today
    const timeMatch = input.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
    if (timeMatch) {
      startTime = new Date(now);
      let hours = parseInt(timeMatch[1]);
      const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const meridiem = timeMatch[3]?.toLowerCase();

      if (meridiem === 'pm' && hours < 12) hours += 12;
      if (meridiem === 'am' && hours === 12) hours = 0;

      startTime.setHours(hours, minutes, 0, 0);

      return {
        success: true,
        startTime: startTime.toISOString()
      };
    }

    return {
      success: false,
      error: 'Could not parse date/time'
    };
  }

  /**
   * Parse duration from natural language
   * @param {string} input - User input
   * @returns {number|null} - Duration in milliseconds
   */
  parseDuration(input) {
    const hoursMatch = input.match(/(\d+)\s*h(?:our)?s?/i);
    const minutesMatch = input.match(/(\d+)\s*m(?:in(?:ute)?s?)?/i);

    let duration = 0;

    if (hoursMatch) {
      duration += parseInt(hoursMatch[1]) * 60 * 60 * 1000;
    }

    if (minutesMatch) {
      duration += parseInt(minutesMatch[1]) * 60 * 1000;
    }

    return duration > 0 ? duration : null;
  }

  /**
   * Format event summary
   * @param {Object} data - Event data
   * @returns {string} - Formatted summary
   */
  formatEventSummary(data) {
    let summary = `📅 ${data.title}\n`;
    summary += `⏰ ${new Date(data.startTime).toLocaleString()}\n`;
    summary += `⏱️ Duration: ${this.formatDuration(new Date(data.endTime) - new Date(data.startTime))}\n`;
    
    if (data.location) {
      summary += `📍 ${data.location}\n`;
    }
    
    if (data.notes) {
      summary += `📝 ${data.notes}\n`;
    }
    
    summary += `⭐ Priority: ${data.priority}/10`;

    return summary;
  }

  /**
   * Format duration
   * @param {number} ms - Duration in milliseconds
   * @returns {string} - Formatted duration
   */
  formatDuration(ms) {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  /**
   * Get active conversation
   * @param {string} playerId - Player ID
   * @returns {Object|null} - Conversation
   */
  getConversation(playerId) {
    return this.conversations.get(playerId) || null;
  }

  /**
   * Cancel conversation
   * @param {string} playerId - Player ID
   */
  cancelConversation(playerId) {
    this.conversations.delete(playerId);
  }
}

export default CalendarConversationFlow;
