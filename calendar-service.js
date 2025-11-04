/**
 * Calendar Service
 * Google Calendar API integration with local storage backup
 * CRUD operations for events with automatic sync
 */

import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class CalendarService {
  constructor() {
    this.storageDir = path.join(__dirname, '../../data');
    this.eventsFile = path.join(this.storageDir, 'events.json');
    this.tokensFile = path.join(this.storageDir, 'google-tokens.json');

    // In-memory storage
    this.events = new Map(); // playerId -> [events]
    this.googleClients = new Map(); // playerId -> google calendar client

    // Create storage directory
    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // Load existing data
    this.loadEvents();

    console.log('[Calendar] ✅ Initialized');
  }

  /**
   * Initialize Google Calendar for player
   * @param {string} playerId - Player ID
   * @param {Object} credentials - OAuth credentials
   * @returns {Promise<Object>} - Result
   */
  async initializeGoogleCalendar(playerId, credentials) {
    try {
      const oauth2Client = new google.auth.OAuth2(
        credentials.clientId,
        credentials.clientSecret,
        credentials.redirectUri
      );

      oauth2Client.setCredentials({
        refresh_token: credentials.refreshToken
      });

      const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

      this.googleClients.set(playerId, calendar);

      console.log(`[Calendar] ✅ Google Calendar initialized for ${playerId}`);

      return {
        success: true,
        message: 'Google Calendar connected'
      };

    } catch (error) {
      console.error('[Calendar] ❌ Error initializing Google Calendar:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create event
   * @param {string} playerId - Player ID
   * @param {Object} eventData - Event data
   * @returns {Promise<Object>} - Created event
   */
  async createEvent(playerId, eventData) {
    try {
      const event = {
        eventId: `evt_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        googleEventId: null,
        playerId,
        title: eventData.title,
        description: eventData.description || '',
        startTime: new Date(eventData.startTime).toISOString(),
        endTime: new Date(eventData.endTime).toISOString(),
        location: eventData.location || '',
        notes: eventData.notes || '',
        priority: eventData.priority || 5,
        status: 'scheduled',
        reminders: eventData.reminders || ['24h', '1h'],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        attendees: eventData.attendees || [],
        recurrence: eventData.recurrence || null
      };

      // Add to local storage
      if (!this.events.has(playerId)) {
        this.events.set(playerId, []);
      }
      this.events.get(playerId).push(event);

      // Sync to Google Calendar if connected
      if (this.googleClients.has(playerId)) {
        const googleEvent = await this.createGoogleEvent(playerId, event);
        event.googleEventId = googleEvent.id;
      }

      this.saveEvents();

      console.log(`[Calendar] ✅ Event created: ${event.title}`);

      return {
        success: true,
        event
      };

    } catch (error) {
      console.error('[Calendar] ❌ Error creating event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get events
   * @param {string} playerId - Player ID
   * @param {Date} startDate - Start date (optional)
   * @param {Date} endDate - End date (optional)
   * @returns {Array} - Events
   */
  getEvents(playerId, startDate = null, endDate = null) {
    let events = this.events.get(playerId) || [];

    if (startDate) {
      events = events.filter(e => new Date(e.startTime) >= startDate);
    }

    if (endDate) {
      events = events.filter(e => new Date(e.startTime) <= endDate);
    }

    return events.sort((a, b) => 
      new Date(a.startTime) - new Date(b.startTime)
    );
  }

  /**
   * Get event by ID
   * @param {string} playerId - Player ID
   * @param {string} eventId - Event ID
   * @returns {Object|null} - Event
   */
  getEvent(playerId, eventId) {
    const events = this.events.get(playerId) || [];
    return events.find(e => e.eventId === eventId) || null;
  }

  /**
   * Update event
   * @param {string} playerId - Player ID
   * @param {string} eventId - Event ID
   * @param {Object} updates - Updates
   * @returns {Promise<Object>} - Result
   */
  async updateEvent(playerId, eventId, updates) {
    try {
      const events = this.events.get(playerId) || [];
      const eventIndex = events.findIndex(e => e.eventId === eventId);

      if (eventIndex === -1) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      const event = events[eventIndex];

      // Apply updates
      Object.assign(event, updates, {
        updatedAt: new Date().toISOString()
      });

      // Sync to Google Calendar
      if (this.googleClients.has(playerId) && event.googleEventId) {
        await this.updateGoogleEvent(playerId, event);
      }

      this.saveEvents();

      console.log(`[Calendar] ✅ Event updated: ${event.title}`);

      return {
        success: true,
        event
      };

    } catch (error) {
      console.error('[Calendar] ❌ Error updating event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete event
   * @param {string} playerId - Player ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} - Result
   */
  async deleteEvent(playerId, eventId) {
    try {
      const events = this.events.get(playerId) || [];
      const eventIndex = events.findIndex(e => e.eventId === eventId);

      if (eventIndex === -1) {
        return {
          success: false,
          error: 'Event not found'
        };
      }

      const event = events[eventIndex];

      // Delete from Google Calendar
      if (this.googleClients.has(playerId) && event.googleEventId) {
        await this.deleteGoogleEvent(playerId, event.googleEventId);
      }

      // Remove from local storage
      events.splice(eventIndex, 1);
      this.saveEvents();

      console.log(`[Calendar] ✅ Event deleted: ${event.title}`);

      return {
        success: true,
        message: 'Event deleted'
      };

    } catch (error) {
      console.error('[Calendar] ❌ Error deleting event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Reschedule event
   * @param {string} playerId - Player ID
   * @param {string} eventId - Event ID
   * @param {Date} newStartTime - New start time
   * @param {Date} newEndTime - New end time (optional)
   * @returns {Promise<Object>} - Result
   */
  async rescheduleEvent(playerId, eventId, newStartTime, newEndTime = null) {
    const event = this.getEvent(playerId, eventId);

    if (!event) {
      return {
        success: false,
        error: 'Event not found'
      };
    }

    // Calculate duration if end time not provided
    if (!newEndTime) {
      const duration = new Date(event.endTime) - new Date(event.startTime);
      newEndTime = new Date(new Date(newStartTime).getTime() + duration);
    }

    return await this.updateEvent(playerId, eventId, {
      startTime: new Date(newStartTime).toISOString(),
      endTime: new Date(newEndTime).toISOString(),
      status: 'rescheduled'
    });
  }

  /**
   * Mark event as completed
   * @param {string} playerId - Player ID
   * @param {string} eventId - Event ID
   * @returns {Promise<Object>} - Result
   */
  async markAsCompleted(playerId, eventId) {
    return await this.updateEvent(playerId, eventId, {
      status: 'completed',
      completedAt: new Date().toISOString()
    });
  }

  /**
   * Detect conflicts
   * @param {string} playerId - Player ID
   * @param {Date} startTime - Start time
   * @param {Date} endTime - End time
   * @param {string} excludeEventId - Event ID to exclude (optional)
   * @returns {Array} - Conflicting events
   */
  detectConflicts(playerId, startTime, endTime, excludeEventId = null) {
    const events = this.events.get(playerId) || [];

    return events.filter(event => {
      if (event.eventId === excludeEventId) return false;
      if (event.status === 'completed' || event.status === 'cancelled') return false;

      const eventStart = new Date(event.startTime);
      const eventEnd = new Date(event.endTime);

      // Check for overlap
      return (startTime < eventEnd && endTime > eventStart);
    });
  }

  /**
   * Sync with Google Calendar
   * @param {string} playerId - Player ID
   * @returns {Promise<Object>} - Result
   */
  async syncWithGoogle(playerId) {
    if (!this.googleClients.has(playerId)) {
      return {
        success: false,
        error: 'Google Calendar not connected'
      };
    }

    try {
      const calendar = this.googleClients.get(playerId);

      // Get events from Google Calendar
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const googleEvents = response.data.items || [];

      // Sync logic (simplified - in production, use more sophisticated sync)
      let syncedCount = 0;

      for (const googleEvent of googleEvents) {
        // Check if event exists locally
        const localEvents = this.events.get(playerId) || [];
        const existingEvent = localEvents.find(e => e.googleEventId === googleEvent.id);

        if (!existingEvent) {
          // Create local event from Google event
          await this.createEvent(playerId, {
            title: googleEvent.summary,
            description: googleEvent.description,
            startTime: googleEvent.start.dateTime || googleEvent.start.date,
            endTime: googleEvent.end.dateTime || googleEvent.end.date,
            location: googleEvent.location
          });
          syncedCount++;
        }
      }

      console.log(`[Calendar] ✅ Synced ${syncedCount} events from Google Calendar`);

      return {
        success: true,
        syncedCount
      };

    } catch (error) {
      console.error('[Calendar] ❌ Error syncing with Google:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create event in Google Calendar
   */
  async createGoogleEvent(playerId, event) {
    const calendar = this.googleClients.get(playerId);

    const googleEvent = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: event.endTime,
        timeZone: 'UTC'
      },
      reminders: {
        useDefault: false,
        overrides: event.reminders.map(r => {
          const minutes = r === '24h' ? 1440 : r === '1h' ? 60 : 10;
          return { method: 'popup', minutes };
        })
      }
    };

    const response = await calendar.events.insert({
      calendarId: 'primary',
      resource: googleEvent
    });

    return response.data;
  }

  /**
   * Update event in Google Calendar
   */
  async updateGoogleEvent(playerId, event) {
    const calendar = this.googleClients.get(playerId);

    const googleEvent = {
      summary: event.title,
      description: event.description,
      location: event.location,
      start: {
        dateTime: event.startTime,
        timeZone: 'UTC'
      },
      end: {
        dateTime: event.endTime,
        timeZone: 'UTC'
      }
    };

    await calendar.events.update({
      calendarId: 'primary',
      eventId: event.googleEventId,
      resource: googleEvent
    });
  }

  /**
   * Delete event from Google Calendar
   */
  async deleteGoogleEvent(playerId, googleEventId) {
    const calendar = this.googleClients.get(playerId);

    await calendar.events.delete({
      calendarId: 'primary',
      eventId: googleEventId
    });
  }

  /**
   * Save events to disk
   */
  saveEvents() {
    try {
      const data = {
        events: Array.from(this.events.entries()),
        version: '1.0.0',
        lastSaved: new Date().toISOString()
      };

      fs.writeFileSync(this.eventsFile, JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('[Calendar] ❌ Error saving events:', error.message);
    }
  }

  /**
   * Load events from disk
   */
  loadEvents() {
    try {
      if (fs.existsSync(this.eventsFile)) {
        const data = JSON.parse(fs.readFileSync(this.eventsFile, 'utf8'));
        this.events = new Map(data.events);
        console.log(`[Calendar] ✅ Loaded ${this.events.size} player calendars`);
      }
    } catch (error) {
      console.error('[Calendar] ❌ Error loading events:', error.message);
    }
  }

  /**
   * Get statistics
   * @param {string} playerId - Player ID (optional)
   * @returns {Object} - Statistics
   */
  getStats(playerId = null) {
    if (playerId) {
      const events = this.events.get(playerId) || [];
      return {
        totalEvents: events.length,
        scheduled: events.filter(e => e.status === 'scheduled').length,
        completed: events.filter(e => e.status === 'completed').length,
        cancelled: events.filter(e => e.status === 'cancelled').length,
        rescheduled: events.filter(e => e.status === 'rescheduled').length
      };
    }

    // Global stats
    let totalEvents = 0;
    for (const events of this.events.values()) {
      totalEvents += events.length;
    }

    return {
      totalPlayers: this.events.size,
      totalEvents,
      googleConnected: this.googleClients.size
    };
  }
}

export default CalendarService;
