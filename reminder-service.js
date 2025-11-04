/**
 * Reminder Service
 * Automated reminders and post-event assessments
 * Schedules notifications before and after events
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ReminderService {
  constructor(calendarService) {
    this.calendarService = calendarService;
    
    this.storageDir = path.join(__dirname, '../../data');
    this.remindersFile = path.join(this.storageDir, 'reminders.json');

    // In-memory storage
    this.reminders = [];
    this.postEventChecks = [];

    // Reminder check interval (every minute)
    this.checkInterval = null;

    // Create storage directory
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Load existing data
    this.loadReminders();

    console.log('[Reminder] ✅ Initialized');
  }

  /**
   * Start reminder service
   */
  start() {
    if (this.checkInterval) {
      console.log('[Reminder] ⚠️ Already running');
      return;
    }

    // Check every minute
    this.checkInterval = setInterval(() => {
      this.checkReminders();
      this.checkPostEventAssessments();
    }, 60 * 1000);

    console.log('[Reminder] ✅ Started (checking every minute)');
  }

  /**
   * Stop reminder service
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[Reminder] ✅ Stopped');
    }
  }

  /**
   * Schedule reminders for event
   * @param {Object} event - Event object
   * @param {Function} notificationCallback - Callback to send notifications
   */
  scheduleReminders(event, notificationCallback) {
    const startTime = new Date(event.startTime);
    const endTime = new Date(event.endTime);

    // Clear existing reminders for this event
    this.reminders = this.reminders.filter(r => r.eventId !== event.eventId);

    // Schedule pre-event reminders
    for (const reminderType of event.reminders || ['24h', '1h']) {
      const reminderTime = this.calculateReminderTime(startTime, reminderType);

      if (reminderTime > new Date()) {
        this.reminders.push({
          reminderId: `rem_${Date.now()}_${Math.random().toString(36).substring(7)}`,
          eventId: event.eventId,
          playerId: event.playerId,
          type: `pre_event_${reminderType}`,
          scheduledTime: reminderTime.toISOString(),
          message: this.generateReminderMessage(event, reminderType),
          status: 'pending',
          attempts: 0,
          callback: notificationCallback
        });
      }
    }

    // Schedule post-event assessment (1 hour after event ends)
    const postEventTime = new Date(endTime.getTime() + 60 * 60 * 1000);

    if (postEventTime > new Date()) {
      this.postEventChecks.push({
        checkId: `check_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        eventId: event.eventId,
        playerId: event.playerId,
        scheduledTime: postEventTime.toISOString(),
        status: 'pending',
        attempts: 0,
        callback: notificationCallback
      });
    }

    this.saveReminders();

    console.log(`[Reminder] ✅ Scheduled ${this.reminders.filter(r => r.eventId === event.eventId).length} reminders for: ${event.title}`);
  }

  /**
   * Calculate reminder time
   * @param {Date} eventTime - Event time
   * @param {string} reminderType - Reminder type (e.g., '24h', '1h')
   * @returns {Date} - Reminder time
   */
  calculateReminderTime(eventTime, reminderType) {
    const time = new Date(eventTime);

    switch (reminderType) {
      case '24h':
        time.setHours(time.getHours() - 24);
        break;
      case '1h':
        time.setHours(time.getHours() - 1);
        break;
      case '30m':
        time.setMinutes(time.getMinutes() - 30);
        break;
      case '10m':
        time.setMinutes(time.getMinutes() - 10);
        break;
      default:
        time.setHours(time.getHours() - 1); // Default: 1 hour
    }

    return time;
  }

  /**
   * Generate reminder message
   * @param {Object} event - Event object
   * @param {string} reminderType - Reminder type
   * @returns {string} - Message
   */
  generateReminderMessage(event, reminderType) {
    const timeMap = {
      '24h': 'tomorrow',
      '1h': 'in 1 hour',
      '30m': 'in 30 minutes',
      '10m': 'in 10 minutes'
    };

    const timeStr = timeMap[reminderType] || 'soon';

    return `🔔 Reminder: You have "${event.title}" ${timeStr} at ${new Date(event.startTime).toLocaleTimeString()}`;
  }

  /**
   * Check for due reminders
   */
  async checkReminders() {
    const now = new Date();
    const dueReminders = this.reminders.filter(r => 
      r.status === 'pending' && new Date(r.scheduledTime) <= now
    );

    if (dueReminders.length === 0) {
      return;
    }

    console.log(`[Reminder] ⏰ ${dueReminders.length} reminders due`);

    for (const reminder of dueReminders) {
      try {
        // Get event details
        const event = this.calendarService.getEvent(reminder.playerId, reminder.eventId);

        if (!event) {
          // Event deleted, remove reminder
          reminder.status = 'cancelled';
          continue;
        }

        // Send notification
        if (reminder.callback) {
          await reminder.callback(reminder.playerId, {
            type: 'calendar_reminder',
            eventId: reminder.eventId,
            reminderType: reminder.type,
            message: reminder.message,
            event: {
              title: event.title,
              startTime: event.startTime,
              endTime: event.endTime,
              location: event.location,
              notes: event.notes
            },
            timestamp: new Date().toISOString()
          });
        }

        reminder.status = 'sent';
        reminder.sentAt = new Date().toISOString();

        console.log(`[Reminder] ✅ Sent: ${reminder.message}`);

      } catch (error) {
        console.error(`[Reminder] ❌ Error sending reminder:`, error.message);
        
        reminder.attempts++;
        
        // Retry up to 3 times
        if (reminder.attempts >= 3) {
          reminder.status = 'failed';
        }
      }
    }

    this.saveReminders();
  }

  /**
   * Check for post-event assessments
   */
  async checkPostEventAssessments() {
    const now = new Date();
    const dueChecks = this.postEventChecks.filter(c => 
      c.status === 'pending' && new Date(c.scheduledTime) <= now
    );

    if (dueChecks.length === 0) {
      return;
    }

    console.log(`[Reminder] 📋 ${dueChecks.length} post-event checks due`);

    for (const check of dueChecks) {
      try {
        // Get event details
        const event = this.calendarService.getEvent(check.playerId, check.eventId);

        if (!event) {
          // Event deleted, remove check
          check.status = 'cancelled';
          continue;
        }

        // Skip if already completed
        if (event.status === 'completed') {
          check.status = 'skipped';
          continue;
        }

        // Send post-event assessment notification
        if (check.callback) {
          await check.callback(check.playerId, {
            type: 'post_event_assessment',
            eventId: check.eventId,
            message: `Did you attend "${event.title}"?`,
            event: {
              title: event.title,
              startTime: event.startTime,
              endTime: event.endTime,
              location: event.location,
              notes: event.notes,
              priority: event.priority
            },
            timestamp: new Date().toISOString()
          });
        }

        check.status = 'sent';
        check.sentAt = new Date().toISOString();

        console.log(`[Reminder] ✅ Post-event check sent for: ${event.title}`);

      } catch (error) {
        console.error(`[Reminder] ❌ Error sending post-event check:`, error.message);
        
        check.attempts++;
        
        // Retry up to 3 times
        if (check.attempts >= 3) {
          check.status = 'failed';
        }
      }
    }

    this.saveReminders();
  }

  /**
   * Cancel reminders for event
   * @param {string} eventId - Event ID
   */
  cancelReminders(eventId) {
    const count = this.reminders.filter(r => r.eventId === eventId && r.status === 'pending').length;

    this.reminders = this.reminders.map(r => {
      if (r.eventId === eventId && r.status === 'pending') {
        r.status = 'cancelled';
      }
      return r;
    });

    this.postEventChecks = this.postEventChecks.map(c => {
      if (c.eventId === eventId && c.status === 'pending') {
        c.status = 'cancelled';
      }
      return c;
    });

    this.saveReminders();

    console.log(`[Reminder] ✅ Cancelled ${count} reminders for event: ${eventId}`);
  }

  /**
   * Get reminders for player
   * @param {string} playerId - Player ID
   * @param {string} status - Status filter (optional)
   * @returns {Array} - Reminders
   */
  getReminders(playerId, status = null) {
    let reminders = this.reminders.filter(r => r.playerId === playerId);

    if (status) {
      reminders = reminders.filter(r => r.status === status);
    }

    return reminders.sort((a, b) => 
      new Date(a.scheduledTime) - new Date(b.scheduledTime)
    );
  }

  /**
   * Get statistics
   * @param {string} playerId - Player ID (optional)
   * @returns {Object} - Statistics
   */
  getStats(playerId = null) {
    let reminders = this.reminders;
    let checks = this.postEventChecks;

    if (playerId) {
      reminders = reminders.filter(r => r.playerId === playerId);
      checks = checks.filter(c => c.playerId === playerId);
    }

    return {
      reminders: {
        total: reminders.length,
        pending: reminders.filter(r => r.status === 'pending').length,
        sent: reminders.filter(r => r.status === 'sent').length,
        failed: reminders.filter(r => r.status === 'failed').length,
        cancelled: reminders.filter(r => r.status === 'cancelled').length
      },
      postEventChecks: {
        total: checks.length,
        pending: checks.filter(c => c.status === 'pending').length,
        sent: checks.filter(c => c.status === 'sent').length,
        failed: checks.filter(c => c.status === 'failed').length,
        cancelled: checks.filter(c => c.status === 'cancelled').length
      }
    };
  }

  /**
   * Save reminders to disk
   */
  saveReminders() {
    try {
      const data = {
        reminders: this.reminders.map(r => ({
          ...r,
          callback: undefined // Don't serialize callbacks
        })),
        postEventChecks: this.postEventChecks.map(c => ({
          ...c,
          callback: undefined
        })),
        version: '1.0.0',
        lastSaved: new Date().toISOString()
      };

      fs.writeFileSync(this.remindersFile, JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('[Reminder] ❌ Error saving reminders:', error.message);
    }
  }

  /**
   * Load reminders from disk
   */
  loadReminders() {
    try {
      if (fs.existsSync(this.remindersFile)) {
        const data = JSON.parse(fs.readFileSync(this.remindersFile, 'utf8'));
        this.reminders = data.reminders || [];
        this.postEventChecks = data.postEventChecks || [];
        
        console.log(`[Reminder] ✅ Loaded ${this.reminders.length} reminders and ${this.postEventChecks.length} checks`);
      }
    } catch (error) {
      console.error('[Reminder] ❌ Error loading reminders:', error.message);
    }
  }

  /**
   * Cleanup old reminders
   * @param {number} daysOld - Days old
   */
  cleanup(daysOld = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const beforeCount = this.reminders.length + this.postEventChecks.length;

    this.reminders = this.reminders.filter(r => 
      new Date(r.scheduledTime) > cutoffDate || r.status === 'pending'
    );

    this.postEventChecks = this.postEventChecks.filter(c => 
      new Date(c.scheduledTime) > cutoffDate || c.status === 'pending'
    );

    const afterCount = this.reminders.length + this.postEventChecks.length;
    const removed = beforeCount - afterCount;

    this.saveReminders();

    console.log(`[Reminder] ✅ Cleaned up ${removed} old reminders`);

    return { removed };
  }
}

export default ReminderService;
