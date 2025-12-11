/// <reference path="../pb_data/types.d.ts" />
migrate((db) => {
  const dao = new Dao(db);
  const collection = dao.findCollectionByNameOrId("user_roles");

  // Admin Role
  const adminRole = new Record(collection);
  adminRole.set("role", "admin");
  adminRole.set("name", "Admin (Parent)");
  adminRole.set("description", "Full system access including user management and system configuration");
  adminRole.set("permissions", {
    "modules": {
      "dashboard": { "read": true, "write": true, "admin": true },
      "chores": { "read": true, "write": true, "admin": true },
      "meals": { "read": true, "write": true, "admin": true }
    },
    "system": {
      "manageUsers": true,
      "viewAuditLog": true
    }
  });
  dao.saveRecord(adminRole);

  // Member Role
  const memberRole = new Record(collection);
  memberRole.set("role", "member");
  memberRole.set("name", "Member (Family)");
  memberRole.set("description", "Standard family member with read/write access to modules but no admin privileges");
  memberRole.set("permissions", {
    "modules": {
      "dashboard": { "read": true, "write": false, "admin": false },
      "chores": { "read": true, "write": true, "admin": false },
      "meals": { "read": true, "write": true, "admin": false }
    },
    "system": {
      "manageUsers": false,
      "viewAuditLog": false
    }
  });
  dao.saveRecord(memberRole);

  // View Only Role
  const viewOnlyRole = new Record(collection);
  viewOnlyRole.set("role", "viewonly");
  viewOnlyRole.set("name", "View Only (Guest)");
  viewOnlyRole.set("description", "Read-only access for guests and visitors");
  viewOnlyRole.set("permissions", {
    "modules": {
      "dashboard": { "read": true, "write": false, "admin": false },
      "chores": { "read": true, "write": false, "admin": false },
      "meals": { "read": true, "write": false, "admin": false }
    },
    "system": {
      "manageUsers": false,
      "viewAuditLog": false
    }
  });
  dao.saveRecord(viewOnlyRole);
}, (db) => {
  const dao = new Dao(db);

  // Delete all seeded roles
  const roles = dao.findRecordsByExpr("user_roles",
    $dbx.in("role", $dbx.exp("'admin', 'member', 'viewonly'")));

  for (const role of roles) {
    dao.deleteRecord(role);
  }
});
