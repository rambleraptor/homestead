#!/bin/bash

# Start PocketBase (libSQL backend) with environment variables
# Usage: ./start-pocketbase.sh

# Load environment variables from frontend/.env
if [ -f frontend/.env ]; then
  export $(grep "^VAPID_" frontend/.env | xargs)
  export $(grep "^POCKETBASE_ADMIN_" frontend/.env | xargs)
  export $(grep "^TURSO_" frontend/.env | xargs)
else
  echo "Warning: frontend/.env not found. Environment variables may not be configured."
fi

# Build if binary doesn't exist
if [ ! -f pocketbase/pocketbase ]; then
  echo "PocketBase binary not found. Building from source..."
  ./deployment/install-pocketbase.sh
fi

# Start PocketBase from project root so pb_hooks/ and pb_migrations/ are found
pocketbase/pocketbase serve \
  --dir=pocketbase/pb_data \
  --hooksDir=pb_hooks \
  --migrationsDir=pb_migrations
