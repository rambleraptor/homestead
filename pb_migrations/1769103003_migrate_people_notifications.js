/// <reference path="../pb_data/types.d.ts" />

/**
 * Migrates people's notification_preferences to recurring_notifications.
 *
 * For each person with notification_preferences:
 * - Creates recurring_notification records for birthday (if person has birthday)
 * - Creates recurring_notification records for anniversary (if person has anniversary)
 *
 * Also migrates existing notifications to include source_collection and source_id.
 *
 * IMPORTANT: This migration is idempotent and can be run multiple times safely.
 * It does NOT modify the notification_preferences field (kept for backward compatibility).
 */
migrate(
  (app) => {
    const peopleCollection = app.findCollectionByNameOrId('people');
    const recurringNotificationsCollection = app.findCollectionByNameOrId('recurring_notifications');
    const notificationsCollection = app.findCollectionByNameOrId('notifications');

    console.log('[Migration] Starting people notification preferences migration...');

    // ===================================================================
    // STEP 1: Migrate people's notification_preferences to recurring_notifications
    // ===================================================================

    // Get all people with notification preferences
    // CRITICAL: Use limit 10000, NOT 0 (0 means "fetch 0 records" in PocketBase)
    const people = app.findRecordsByFilter(
      'people',
      'notification_preferences != null && notification_preferences != "[]"',
      '',     // No sort needed for migration
      10000,  // Maximum records to fetch (sufficient for most installations)
      0       // Offset
    );

    console.log(`[Migration] Found ${people.length} people with notification preferences to migrate`);

    // Templates matching frontend implementation (notificationSync.ts)
    const templates = {
      birthday: {
        title: 'Birthday Reminder - {{name}}',
        message: "{{name}}'s birthday is coming up on {{date}}!",
      },
      anniversary: {
        title: 'Anniversary Reminder - {{name}}',
        message: "{{name}}'s anniversary is coming up on {{date}}!",
      },
    };

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const person of people) {
      const preferences = person.get('notification_preferences');
      const createdBy = person.get('created_by');
      const birthday = person.get('birthday');
      const anniversary = person.get('anniversary');
      const personName = person.get('name') || 'Unknown';

      // Skip if no preferences or no user
      if (!preferences || !createdBy) {
        skippedCount++;
        continue;
      }

      // Parse preferences (it's stored as JSON)
      let prefs;
      try {
        // PocketBase returns JSON fields as byte arrays (Uint8Array or number arrays)
        // We need to convert bytes back to string, then parse as JSON
        if (Array.isArray(preferences)) {
          // Convert byte array to string
          const jsonString = String.fromCharCode(...preferences);
          prefs = JSON.parse(jsonString);
        } else if (typeof preferences === 'string') {
          // Already a string, just parse it
          prefs = JSON.parse(preferences);
        } else if (preferences && typeof preferences === 'object') {
          // Already parsed (shouldn't happen but handle it)
          prefs = preferences;
        } else {
          console.log(`[Migration] Unexpected preferences type for person ${person.id} (${personName}):`, typeof preferences);
          errorCount++;
          continue;
        }
      } catch (e) {
        console.log(`[Migration] Could not parse preferences for person ${person.id} (${personName}):`, e);
        errorCount++;
        continue;
      }

      // CRITICAL: Validate that prefs is actually an array
      if (!Array.isArray(prefs)) {
        console.log(`[Migration] Preferences is not an array for person ${person.id} (${personName}): ${typeof prefs} - ${JSON.stringify(prefs)}`);
        errorCount++;
        continue;
      }

      if (prefs.length === 0) {
        skippedCount++;
        continue;
      }

      // Validate that all timing values are valid
      const validTimings = ['day_of', 'day_before', 'week_before'];
      const invalidTimings = prefs.filter(t => !validTimings.includes(t));
      if (invalidTimings.length > 0) {
        console.log(`[Migration] Invalid timing values for person ${person.id} (${personName}):`, invalidTimings);
        errorCount++;
        continue;
      }

      // Create recurring notifications for birthday
      if (birthday) {
        for (const timing of prefs) {
          try {
            const record = new Record(recurringNotificationsCollection);
            record.set('user_id', createdBy);
            record.set('source_collection', 'people');
            record.set('source_id', person.id);
            record.set('title_template', templates.birthday.title);
            record.set('message_template', templates.birthday.message);
            record.set('reference_date_field', 'birthday');
            record.set('timing', timing);
            record.set('enabled', true);
            app.save(record);
            createdCount++;
          } catch (e) {
            // Skip duplicates (unique constraint on user_id, source_collection, source_id, reference_date_field, timing)
            // This makes the migration idempotent - safe to run multiple times
            if (!e.message?.includes('UNIQUE constraint failed')) {
              console.log(`[Migration] Error creating birthday recurring notification for person ${person.id} (${personName}):`, e);
              errorCount++;
            }
          }
        }
      }

      // Create recurring notifications for anniversary
      if (anniversary) {
        for (const timing of prefs) {
          try {
            const record = new Record(recurringNotificationsCollection);
            record.set('user_id', createdBy);
            record.set('source_collection', 'people');
            record.set('source_id', person.id);
            record.set('title_template', templates.anniversary.title);
            record.set('message_template', templates.anniversary.message);
            record.set('reference_date_field', 'anniversary');
            record.set('timing', timing);
            record.set('enabled', true);
            app.save(record);
            createdCount++;
          } catch (e) {
            // Skip duplicates (unique constraint)
            if (!e.message?.includes('UNIQUE constraint failed')) {
              console.log(`[Migration] Error creating anniversary recurring notification for person ${person.id} (${personName}):`, e);
              errorCount++;
            }
          }
        }
      }
    }

    console.log(`[Migration] Created ${createdCount} recurring notification records (skipped: ${skippedCount}, errors: ${errorCount})`);

    // ===================================================================
    // STEP 2: Migrate existing notifications to include universal source fields
    // ===================================================================

    const existingNotifications = app.findRecordsByFilter(
      'notifications',
      'person_id != null && person_id != ""',
      '',     // No sort needed for migration
      10000,
      0
    );

    console.log(`[Migration] Found ${existingNotifications.length} existing notifications to migrate`);

    let migratedCount = 0;
    for (const notification of existingNotifications) {
      const personId = notification.get('person_id');
      if (personId) {
        try {
          notification.set('source_collection', 'people');
          notification.set('source_id', personId);
          app.save(notification);
          migratedCount++;
        } catch (e) {
          console.log(`[Migration] Error migrating notification ${notification.id}:`, e);
        }
      }
    }

    console.log(`[Migration] Migrated ${migratedCount} existing notifications`);
    console.log('[Migration] People notification preferences migration complete!');

    return null;
  },
  (app) => {
    console.log('[Rollback] Rolling back people notification preferences migration...');

    // ===================================================================
    // STEP 1: Delete all recurring_notifications for people
    // ===================================================================

    const recurringNotifications = app.findRecordsByFilter(
      'recurring_notifications',
      'source_collection = "people"',
      '',     // No sort needed for rollback
      10000,
      0
    );

    console.log(`[Rollback] Deleting ${recurringNotifications.length} recurring notifications`);

    for (const record of recurringNotifications) {
      try {
        app.delete(record);
      } catch (e) {
        console.log(`[Rollback] Error deleting recurring notification ${record.id}:`, e);
      }
    }

    // ===================================================================
    // STEP 2: Clear source_collection and source_id from notifications
    // ===================================================================

    const notifications = app.findRecordsByFilter(
      'notifications',
      'source_collection = "people"',
      '',     // No sort needed for rollback
      10000,
      0
    );

    console.log(`[Rollback] Clearing universal fields from ${notifications.length} notifications`);

    for (const notification of notifications) {
      try {
        notification.set('source_collection', '');
        notification.set('source_id', '');
        app.save(notification);
      } catch (e) {
        console.log(`[Rollback] Error clearing notification ${notification.id}:`, e);
      }
    }

    console.log('[Rollback] Rollback complete. notification_preferences field remains unchanged.');

    return null;
  }
);
